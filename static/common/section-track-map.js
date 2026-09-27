/* section-track-map.js — corner map on a trip's section page.
 *
 * Used by templates/section_track_map.html. Draws every day's track from the cards' data-track-url attributes,
 * highlights the day whose card is in view and frames its whole track. Before the first card reaches the reading
 * line the map shows the whole trip. In listing mode (year pages and the home page, where a trip is one card), it
 * shows only the card in view, loads each card's tracks as the card comes near, and fades away over a card without
 * a track. Reads:
 *   - #es-section-track-config  JSON written by the template (trip title, listing mode, basemap options)
 *   - .pages > .card            data-track-url and data-track-fallback (space-separated, paired by position, "-" for
 *                               no fallback), data-title, data-permalink, data-route, data-distance, data-days
 *   - CSS custom properties on the widget (--es-track-*) for every colour
 * The modes, distance formatting, day summary, and basemap come from track-common.js.
 */
(function () {
  'use strict';

  const cfgEl = document.getElementById('es-section-track-config');
  const widget = document.getElementById('es-track-widget');
  if (!cfgEl || !widget || !window.esTrack) return;
  const { MODES, iconSvg, fmtBoth, modeSummary } = window.esTrack;
  const CFG = JSON.parse(cfgEl.textContent);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tok = n => getComputedStyle(widget).getPropertyValue('--es-track-' + n).trim();
  const isPhone = () => innerWidth <= 720;

  // A day's view spans at least this far across, as on the page's own map.
  const DAY_MIN_SPAN_M = 3000;

  // The reading line, as a fraction of the window's height: the card that crosses it is the one in view.
  const FOCUS_LINE = 0.4;

  const notice = document.getElementById('es-track-notice');
  const ico = document.getElementById('es-track-ico');
  const text = document.getElementById('es-track-text');
  const collapseBtn = document.getElementById('es-track-collapse');
  const attrBtn = document.getElementById('es-track-attr-btn');
  const showNotice = msg => { notice.textContent = msg || ''; notice.hidden = !msg; };

  const LISTING = !!CFG.listing;

  // A card has one track per day: one on a trip's day card, one per day on a trip's card in a listing.
  const cards = Array.from(document.querySelectorAll('.pages > .card')).map(el => {
    const urls = (el.dataset.trackUrl || '').split(' ').filter(Boolean);
    const fallbacks = (el.dataset.trackFallback || '').split(' ');
    return {
      el,
      tracks: urls.map((url, k) => ({
        url,
        fallback: fallbacks[k] && fallbacks[k] !== '-' ? fallbacks[k] : '',
        state: 'waiting',  // Then 'loading', then 'ok' or 'failed'.
        coords: null,
        legs: [],
        distM: 0,
      })),
      title: el.dataset.title || '',
      permalink: el.dataset.permalink || '',
      route: el.dataset.route || '',
      distance: el.dataset.distance || '',
      days: +el.dataset.days || 0,
      state: urls.length ? 'loading' : 'none',  // Then 'ok' (once any track has arrived) or 'failed'.
      requested: false,
      legs: [],
      distM: 0,
    };
  });

  let map = null, mapReady = false, baseStyle = null, baseTried = false, noLibrary = false;
  let region = null;  // The site's region (`region_outline`), set apart from its surroundings, or null.
  let focus = null, collapsed = false;

  // ------------------------------------------------------------ tracks
  // `lon` moved by whole turns to lie within 180° of `ref`.
  const nearLon = (lon, ref) => lon + 360 * Math.round((ref - lon) / 360);

  const R = 6371000;
  function hav(a, b) {
    const toR = Math.PI / 180;
    const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Each leg's mode and distance, for the day's summary: the leg's `dist_m`, else measured along its points.
  const legsOf = track => (track.legs || []).map(l => {
    const pts = l.pts || [];
    let m = typeof l.dist_m === 'number' ? l.dist_m : 0;
    if (typeof l.dist_m !== 'number') for (let k = 1; k < pts.length; k++) m += hav(pts[k - 1], pts[k]);
    return { mode: l.mode, m };
  });

  // The track's points as one line, each longitude within 180° of the one before, so a track that crosses the
  // antimeridian runs on past ±180° instead of doubling back around the world.
  function trackCoords(track) {
    const out = [];
    let prev = null;
    (track.legs || []).forEach(l => (l.pts || []).forEach(p => {
      const lon = prev == null ? p[0] : nearLon(p[0], prev);
      out.push([lon, p[1]]);
      prev = lon;
    }));
    return out;
  }

  const load = url => fetch(url, { credentials: 'omit' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url); return r.json(); });

  // The CDN only answers cross-origin fetches from the production origins; a deploy preview proxies the same path
  // through its own origin instead, so retry there when the direct fetch was refused outright. Each day is drawn as
  // soon as its track arrives, so one slow track doesn't hold up the rest.
  function loadTrack(c, t) {
    t.state = 'loading';
    return load(t.url)
      .catch(err => {
        if (!t.fallback || !(err instanceof TypeError)) throw err;
        return load(t.fallback);
      })
      .then(track => {
        const coords = trackCoords(track);
        if (coords.length < 2) throw new Error('track has no line');
        t.coords = coords;
        t.legs = legsOf(track);
        t.distM = typeof track.dist_m === 'number' ? track.dist_m : 0;
        t.state = 'ok';
      })
      .catch(err => {
        t.state = 'failed';
        console.warn('section-track-map: could not load ' + t.url, err);
      })
      .then(() => {
        const ok = c.tracks.filter(k => k.state === 'ok');
        c.state = ok.length ? 'ok' : c.tracks.some(k => k.state !== 'failed') ? 'loading' : 'failed';
        c.legs = ok.flatMap(k => k.legs);
        c.distM = ok.reduce((m, k) => m + k.distM, 0);
        dayLoaded(c);
      });
  }

  function loadCard(c) {
    if (c.requested) return;
    c.requested = true;
    c.tracks.forEach(t => loadTrack(c, t));
  }

  const allLoaded = c => c.tracks.every(t => t.state === 'ok');

  // Each day moved by whole turns to start near where the day before ended, so the trip stays on one world copy. In
  // a listing, the cards' trips are unrelated, so each card's days are joined on their own.
  function joinDays() {
    const join = tracks => {
      let prev = null;
      tracks.forEach(t => {
        if (prev != null) {
          const shift = nearLon(t.coords[0][0], prev) - t.coords[0][0];
          if (shift) t.coords.forEach(p => { p[0] += shift; });
        }
        prev = t.coords[t.coords.length - 1][0];
      });
    };
    const okTracks = c => c.tracks.filter(t => t.state === 'ok');
    if (LISTING) tracked().forEach(c => join(okTracks(c)));
    else join(tracked().flatMap(okTracks));
  }

  const tracked = () => cards.filter(c => c.state === 'ok');

  // ------------------------------------------------------------ map
  // In a listing, only the card in view is drawn, so the map is given that card's tracks alone.
  const tripData = () => ({
    type: 'FeatureCollection',
    features: cards.flatMap((c, i) => LISTING && i !== focus ? [] : c.tracks.filter(t => t.state === 'ok')
      .map(t => ({ type: 'Feature', properties: { i }, geometry: { type: 'LineString', coordinates: t.coords } }))),
  });

  // As on the page's map: the day in view is current (green, with a soft glow beneath), the most recent day before
  // it with a track is traveled (amber), the days before that are finished (a darker amber), and the days after it
  // are ahead (a darker grey). Each is its own layer, drawn from the days ahead up to the current one, so a later
  // day never hides an earlier one where they share a road. The whole-trip view draws every day as traveled.
  const at = () => focus == null ? -2 : focus;
  function prevDay() {
    for (let i = at() - 1; i >= 0; i--) if (cards[i].state === 'ok') return i;
    return -2;
  }

  // In a listing, the cards are unrelated, so only the card in view is drawn.
  const NONE = ['==', ['get', 'i'], -2];
  const FILTERS = {
    'es-trip-casing': () => LISTING ? ['==', ['get', 'i'], at()] : ['>=', ['get', 'i'], 0],
    'es-trip-ahead': () => LISTING ? NONE : focus === -1 ? ['<', ['get', 'i'], 0] : ['>', ['get', 'i'], at()],
    'es-trip-finished': () => LISTING ? NONE : ['<', ['get', 'i'], focus === -1 ? 0 : prevDay()],
    'es-trip-current-halo': () => ['==', ['get', 'i'], at()],
    'es-trip-done': () => LISTING ? NONE : focus === -1 ? ['>=', ['get', 'i'], 0] : ['==', ['get', 'i'], prevDay()],
    'es-trip-current': () => ['==', ['get', 'i'], at()],
  };

  function buildStyle() {
    const style = window.esTrack.basemapStyle(baseStyle, { cfg: CFG, tok, detail: CFG.detail || 'minimal' });
    window.esTrack.addRegion(style, region, tok);
    style.sources.trip = { type: 'geojson', data: tripData() };
    const line = { 'line-cap': 'round', 'line-join': 'round' };
    const day = (id, paint) => ({ id, type: 'line', source: 'trip', filter: FILTERS[id](), layout: line, paint });
    style.layers.push(
      day('es-trip-casing', { 'line-color': tok('casing'), 'line-width': 4.8 }),
      day('es-trip-ahead', { 'line-color': tok('ahead-dim'), 'line-width': 3 }),
      day('es-trip-finished', { 'line-color': tok('accent-dim'), 'line-width': 3 }),
      day('es-trip-current-halo', { 'line-color': tok('current-halo'), 'line-width': 12, 'line-blur': 1.5 }),
      day('es-trip-done', { 'line-color': tok('accent'), 'line-width': 3 }),
      day('es-trip-current', { 'line-color': tok('current'), 'line-width': 3 }),
    );
    widget.classList.add('basemap-muted');
    return style;
  }

  // Bounds reaching `r` metres from `c` ([lon, lat]) each way.
  const aroundBounds = (c, r) => {
    const dLat = r / 111320, dLon = r / (111320 * Math.cos(c[1] * Math.PI / 180));
    return [[c[0] - dLon, c[1] - dLat], [c[0] + dLon, c[1] + dLat]];
  };

  // The given days' tracks, widened about their centre to at least DAY_MIN_SPAN_M across.
  function boundsOf(days) {
    const b = new maplibregl.LngLatBounds();
    days.forEach(c => c.tracks.forEach(t => { if (t.state === 'ok') t.coords.forEach(p => b.extend(p)); }));
    const mid = b.getCenter();
    aroundBounds([mid.lng, mid.lat], DAY_MIN_SPAN_M / 2).forEach(p => b.extend(p));
    return b;
  }

  function frame(instant) {
    if (!mapReady || collapsed) return;
    const c = focus >= 0 ? cards[focus] : null;
    const days = c && c.state === 'ok' ? [c] : LISTING ? [] : tracked();
    if (!days.length) return;
    map.fitBounds(boundsOf(days), { padding: isPhone() ? 14 : 26, maxZoom: 15, duration: instant || RM ? 0 : 1100, essential: true });
  }

  // ------------------------------------------------------------ caption
  // Three lines, as the page's map sums up its day: the day's title (cut to one line), its route, and its main ways
  // of travel with its distance, under the icon of the main one. A day without a map says why in place of its
  // route. The whole-trip view gives the trip's title, its number of days, and its total distance, without naming
  // ways of travel; the distance only once every day's track has loaded, since a partial sum would understate it.
  // A trip's card in a listing gives its number of days in place of a route, and its ways of travel and distance
  // across every day.
  const DAY_STATUS = { loading: 'Loading map …', failed: 'The map for this day could not be loaded', none: 'No map for this day' };

  function caption() {
    const c = focus >= 0 ? cards[focus] : null;
    const hasMap = !!(c && c.state === 'ok');
    const sum = hasMap ? modeSummary(c.legs) : null;
    let second, third;
    if (c) {
      const days = c.days ? (c.days === 1 ? '1 day' : `${c.days} days`) : '';
      const dist = c.distance || (c.distM && allLoaded(c) ? fmtBoth(c.distM) : '');
      second = hasMap ? c.route || days : DAY_STATUS[c.state];
      third = hasMap ? [sum ? sum.ways : '', dist].filter(Boolean).join(' · ') : '';
    } else {
      const total = cards.reduce((s, d) => s + d.distM, 0);
      second = cards.length === 1 ? '1 day' : `${cards.length} days`;
      third = total && cards.every(d => d.state === 'ok') ? fmtBoth(total) : '';
    }
    const md = sum ? MODES[sum.mode] : null;
    ico.innerHTML = iconSvg(md ? md.icon : 'route');

    // Titles and routes come from the site, but are set as text all the same.
    const lines = [['mode', c ? c.title : CFG.title], ['label', second], ['label', third]];
    text.replaceChildren(...lines.filter(([, t]) => t).map(([cls, t]) => {
      const el = document.createElement('span');
      el.className = cls;
      el.textContent = t;
      return el;
    }));
    widget.title = hasMap ? `Open the map for ${c.title}` : '';
  }

  // Over the map: if the map library is missing, that; while no track has arrived, that it is loading; if none
  // could be loaded, that the map failed; otherwise, if the basemap failed, that the routes are shown alone.
  function updateNotice() {
    if (LISTING) {
      const c = focus >= 0 ? cards[focus] : null;
      if (noLibrary) showNotice('The map library could not be loaded.');
      else if (c && c.state === 'loading') showNotice('Loading map …');
      else if (c && c.state === 'ok' && baseTried && !baseStyle) showNotice('Map tiles unavailable. Showing the route alone.');
      else showNotice('');
      return;
    }
    if (noLibrary) showNotice('The map library could not be loaded.');
    else if (tracked().length) showNotice(baseTried && !baseStyle ? 'Map tiles unavailable. Showing the route alone.' : '');
    else if (cards.some(c => c.state === 'loading')) showNotice('Loading map …');
    else showNotice('The map for this trip could not be loaded.');
  }

  // A day's track has arrived or failed: redraw the trip, and reframe if the view depends on that day.
  function dayLoaded(c) {
    if (c.state === 'ok') joinDays();
    if (mapReady && (!LISTING || c === cards[focus])) map.getSource('trip').setData(tripData());
    caption();
    applyFilters();
    updateNotice();
    const f = focus >= 0 ? cards[focus] : null;
    if (!f || f === c || f.state !== 'ok') frame(false);
  }

  // ------------------------------------------------------------ following the reader
  // The card that crosses the reading line, else the nearest one; -1 before the first card reaches the line.
  function focusIndex() {
    if (!cards.length) return -1;
    const line = innerHeight * FOCUS_LINE;
    if (cards[0].el.getBoundingClientRect().top > line) return -1;

    // At the foot of the page the last card may never reach the line.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) return cards.length - 1;
    let best = 0, bd = Infinity;
    cards.forEach((c, i) => {
      const r = c.el.getBoundingClientRect();
      const d = r.top > line ? r.top - line : r.bottom < line ? line - r.bottom : 0;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function applyFilters() {
    if (mapReady) Object.keys(FILTERS).forEach(id => map.setFilter(id, FILTERS[id]()));
  }

  // In a listing, the widget fades away while the card in view has no track, or before the first card.
  function updateIdle() {
    if (!LISTING) return;
    const c = focus >= 0 ? cards[focus] : null;
    widget.classList.toggle('is-idle', !c || c.state === 'none');
  }

  function setFocus(i, instant) {
    if (i === focus) return;
    focus = i;
    if (LISTING && mapReady) map.getSource('trip').setData(tripData());
    updateIdle();
    updateNotice();
    caption();
    applyFilters();
    frame(instant);
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      setFocus(focusIndex(), false);
      updateOverlap();
    });
  }

  // Fade the widget while it sits over a cover photo, as on the page's map.
  function updateOverlap() {
    if (!CFG.dim || isPhone()) { widget.classList.remove('over-photo'); return; }
    const w = widget.getBoundingClientRect();
    let over = false;
    for (const c of cards) {
      const img = c.el.querySelector('.card-image img');
      if (!img) continue;
      const r = img.getBoundingClientRect();
      if (r.left < w.right && r.right > w.left && r.top < w.bottom && r.bottom > w.top) { over = true; break; }
    }
    widget.classList.toggle('over-photo', over);
  }

  function setCollapsed(v, remember) {
    collapsed = v;
    widget.classList.toggle('is-collapsed', v);
    collapseBtn.setAttribute('aria-expanded', String(!v));
    collapseBtn.setAttribute('aria-label', v ? 'Show map' : 'Collapse map');
    if (remember) { try { localStorage.setItem('es-track-collapsed', v ? '1' : '0'); } catch (e) { /* Private mode. */ } }
    if (!v && mapReady) requestAnimationFrame(() => { map.resize(); frame(true); });
    updateOverlap();
  }

  // ------------------------------------------------------------ controls
  // Clicking the map opens the day in view at its own map.
  widget.addEventListener('click', e => {
    if (e.target.closest('.es-track-attr-btn, .es-track-attr, .es-track-collapse')) return;
    if (collapsed) { setCollapsed(false, true); return; }
    const c = focus >= 0 ? cards[focus] : null;

    // A trip's section page has no map anchor; its own corner map shows the whole trip at the top.
    if (c && c.permalink && c.state === 'ok') location.href = c.permalink + (c.days ? '' : '#map');
  });
  attrBtn.addEventListener('click', e => { e.stopPropagation(); attrBtn.setAttribute('aria-expanded', String(attrBtn.getAttribute('aria-expanded') !== 'true')); });
  collapseBtn.addEventListener('click', e => { e.stopPropagation(); setCollapsed(!collapsed, true); });

  // ------------------------------------------------------------ boot
  async function start() {
    const withTracks = cards.filter(c => c.tracks.length);
    if (!withTracks.length) return;

    // The widget appears at once, saying the map is loading, and each day is drawn as its track arrives.
    widget.hidden = false;
    try { const v = localStorage.getItem('es-track-collapsed'); collapsed = v === null ? (isPhone() && CFG.mobileCollapsed) : v === '1'; }
    catch (e) { collapsed = isPhone() && CFG.mobileCollapsed; }
    setCollapsed(collapsed, false);
    focus = focusIndex();
    updateIdle();
    caption();
    showNotice(LISTING ? '' : 'Loading map …');
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { onScroll(); if (mapReady) { map.resize(); frame(true); } });

    // A listing can hold hundreds of cards, so each card's tracks load as it comes within a window or so of view.
    if (LISTING && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        loadCard(cards.find(c => c.el === e.target));
      }), { rootMargin: '100% 0px' });
      withTracks.forEach(c => io.observe(c.el));
    } else {
      withTracks.forEach(loadCard);
    }

    [baseStyle, region] = await Promise.all([window.esTrack.loadBasemap(CFG, tok), window.esTrack.loadRegion(CFG.regionOutline)]);
    baseTried = true;
    noLibrary = !window.maplibregl;
    updateNotice();
    if (noLibrary) return;

    // A trip with long flights can span most of the globe, which only fits the corner widget below zoom 1.
    map = new maplibregl.Map({ container: 'es-track-canvas', style: buildStyle(), interactive: false, attributionControl: false, fadeDuration: 0, maxZoom: 17, minZoom: 0 });

    // Tracks may have arrived, and the reader scrolled on, while the map loaded.
    map.on('load', () => {
      mapReady = true;
      map.getSource('trip').setData(tripData());
      applyFilters();
      frame(true);
    });

    map.on('error', e => { const m = (e && e.error && e.error.message) || ''; if (m) console.warn('section-track-map:', m); });
    onScroll();
  }

  start().catch(err => console.warn('section-track-map:', err));
})();
