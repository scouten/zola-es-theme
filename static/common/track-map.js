/* track-map.js — corner map that follows the reader through a day's photos.
 *
 * Used by templates/track_map.html for pages with a `track_key`. Reads:
 *   - #es-track-config   JSON written by the template (track URL, basemap options)
 *   - window.addGpxMarkers  the page's unchanged markers.js, via the shims in the template
 *   - CSS custom properties on the widget (--es-track-*) for every colour
 * Track JSON format: docs/track-map.md. No clock times are ever shown.
 */
(function () {
  'use strict';

  if (!window.esTrack) return;
  const { MODES, iconSvg, tierOf, imperialTierOf, fmtMetricAs, fmtImperialAs, fmtBoth, modeSummary, isPhone } = window.esTrack;

  // legs whose caption may show a duration (the only time-derived value ever shown)
  const TIMED = ['fly', 'prop', 'boat', 'ferry', 'helicopter'];
  // On a flight leg the corner map centres on the aircraft and shows roughly what's in view from the window: about
  // ten times the altitude either side (3–80 km), or else three minutes' travel at the video's speed, or else a
  // default radius for the mode.
  const FLIGHT_RADIUS_M = { fly: 50000, prop: 8000, helicopter: 4000 };

  // The whole-day view spans at least this far across, so a short day still shows its surroundings.
  const DAY_MIN_SPAN_M = 3000;

  // With `start_span_km` set, the corner map opens on the day's region, at least that far across, until the reader
  // scrolls this far; then it closes in on the day.
  const REGION_SCROLL_PX = 24;

  const cfgEl = document.getElementById('es-track-config');
  const widget = document.getElementById('es-track-widget');
  if (!cfgEl || !widget) return;
  const CFG = JSON.parse(cfgEl.textContent);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tok = n => getComputedStyle(widget).getPropertyValue('--es-track-' + n).trim();

  // ------------------------------------------------------------ helpers
  const R = 6371000;
  function hav(a, b) {
    const toR = Math.PI / 180;
    const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // Same tier as a reference distance, so "0 km / 0 mi" sits beside "167 km / 104 mi".
  const fmtLike = (m, ref) => `${fmtMetricAs(m, tierOf(ref))} / ${fmtImperialAs(m, imperialTierOf(ref))}`;
  const fmtSpeed = kmh => `${Math.round(kmh).toLocaleString('en-US')} km/h / ${Math.round(kmh / 1.609344).toLocaleString('en-US')} mph`;
  // Feet to the nearest 10, as `fmtBoth` gives short distances. Altitudes stay in feet however high.
  const fmtAlt = m => `${Math.round(m).toLocaleString('en-US')} m / ${(Math.round(m * 3.28084 / 10) * 10).toLocaleString('en-US')} ft`;
  // Units run against the numbers, unlike distances: "1h 0min", "14h 15min", "45min".
  function fmtDur(s) {
    const m = Math.round(s / 60), h = Math.floor(m / 60);
    return h ? `${h}h ${m % 60}min` : `${m}min`;
  }

  // ------------------------------------------------------------ page content
  const markers = (typeof window.addGpxMarkers === 'function') ? (window.addGpxMarkers(null) || []).filter(Boolean) : [];
  const photos = [];
  markers.forEach(m => {
    let el = document.getElementById(m.id);
    if (!el) return;
    el = el.closest('.es_image, .es_video') || el;

    // A video's marker names no image on the CDN, so its card shows the player's poster. Once Video.js has set up
    // the player, the id is on its wrapper, not the <video>.
    const media = el.querySelector('video'), poster = media ? media.getAttribute('poster') : '';
    const cap = el.querySelector('.caption');
    const loc = cap ? cap.textContent.replace(/\s+/g, ' ').replace(/\s*·\s*by\s.*$/, '').trim() : '';
    const thumb = poster || m.thumb;
    photos.push({ id: m.id, lat: m.lat, lon: m.lon, thumb, thumbLarge: poster || m.thumbLarge || thumb, loc, el });
  });
  const items = photos.map(p => ({ kind: 'photo', el: p.el, photo: p }));
  const content = document.getElementById('es-content');
  if (content) {
    content.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > ul, :scope > ol, :scope > blockquote').forEach(el => items.push({ kind: 'p', el }));
  }
  items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

  // ------------------------------------------------------------ DOM handles
  const slot = document.getElementById('map');
  const modal = document.getElementById('es-track-modal');
  const notice = document.getElementById('es-track-notice');
  const thumb = document.getElementById('es-track-thumb');
  const badge = document.getElementById('es-track-badge');
  const badgeTail = document.getElementById('es-track-badge-tail');
  const thumbTail = document.getElementById('es-track-thumb-tail');
  const thumbImg = thumb.querySelector('img');
  const thumbLoc = document.getElementById('es-track-thumb-loc');
  const collapseBtn = document.getElementById('es-track-collapse');
  const attrBtn = document.getElementById('es-track-attr-btn');
  const showNotice = msg => { notice.textContent = msg || ''; notice.hidden = !msg; };

  // ------------------------------------------------------------ state
  let SEGMENTS = [], pts = [], cum = [], segOf = [], total = 0;
  let eleAt = [];  // each track point's logged altitude in metres, or null where it's missing or nonsense (see flatten)
  let distM = 0;  // the day's distance as published (dist_m), which the page's front matter also shows
  let tripDays = 1;  // calendar days the log covers (the page's `days`, else the JSON's): more than one is a trip, not a day
  let PARKS = [];  // the parks the page highlights (the JSON's `parks`), tinted under the track
  let REGION = null;  // the site's region (`region_outline`), set apart from its surroundings, or null
  let map = null, mapReady = false, baseStyle = null;
  let placement = 'corner', placedOnce = false, slotVisible = false, expanded = false, collapsed = false;
  let view = null, lastCamKey = null, lastGrad = '', lastPhotoIdx = '';
  let browseStep = null;  // index into STEPS while stepping with the arrows, or null to follow the article
  let STEPS = [];         // the day as a sequence: each leg, then the photos taken on it

  // ------------------------------------------------------------ track
  // `lon` moved by whole turns to lie within 180° of `ref`.
  const nearLon = (lon, ref) => lon + 360 * Math.round((ref - lon) / 360);

  // Screen position of `c` ([lon, lat]) on the world copy nearest the camera. MapLibre keeps its centre within
  // ±180°, while an unwrapped track can run past that, so a point near Seoul may be at -233° with the centre at 127°.
  const project = c => map.project([nearLon(c[0], map.getCenter().lng), c[1]]);

  // A track that crosses the antimeridian jumps from about -180° to about +180° (or back), and a line drawn
  // between those points would run the long way around the world. Each point's longitude is moved by whole
  // turns to lie within 180° of the one before it, so the track runs on past ±180° instead, which MapLibre
  // draws, fits and pans across as one continuous line.
  function unwrapLongitudes() {
    let prev = null;
    SEGMENTS.forEach(s => s.coords.forEach(c => {
      if (prev != null) c[0] = nearLon(c[0], prev);
      prev = c[0];
    }));
  }

  // A park moved onto the same world copy as the track: each vertex's longitude lies within 180° of the track
  // point nearest the park's first vertex, so fitting the park and the track together stays tight.
  function unwrapPark(park) {
    const first = park.polys[0][0][0];
    let ref = first[0], bd = Infinity;
    pts.forEach(c => { const d = hav(first, c); if (d < bd) { bd = d; ref = c[0]; } });
    return Object.assign({}, park, { polys: park.polys.map(poly => poly.map(ring => ring.map(c => [nearLon(c[0], ref), c[1]]))) });
  }

  function flatten() {
    pts = []; cum = []; segOf = []; eleAt = [];
    SEGMENTS.forEach((s, si) => {
      s.start = pts.length;
      s.coords.forEach((c, k) => {
        if (pts.length === 0) { pts.push(c); cum.push(0); segOf.push(si); eleAt.push(s.eles[k]); return; }
        const d = hav(pts[pts.length - 1], c);
        if (d < 0.5 && pts.length !== s.start) return;
        pts.push(c); cum.push(cum[cum.length - 1] + d); segOf.push(si); eleAt.push(s.eles[k]);
      });
      s.end = pts.length - 1;
    });
    total = cum[cum.length - 1] || 0;

    // As nf does for flight videos: nothing here flies below sea level, so a dip in the logged altitude below -5 m
    // that reaches -10 m is nonsense, and the whole dip is dropped.
    eleAt = eleAt.map(e => typeof e === 'number' ? e : null);
    for (let k = 0; k < eleAt.length;) {
      if (!(eleAt[k] < -5)) { k++; continue; }
      let j = k, bad = false;
      while (j < eleAt.length && eleAt[j] < -5) { if (eleAt[j] < -10) bad = true; j++; }
      if (bad) for (let i = k; i < j; i++) eleAt[i] = null;
      k = j;
    }

    // Each leg's lowest believed altitude: its ground or water level, near enough.
    SEGMENTS.forEach(s => {
      const eles = eleAt.slice(s.start, s.end + 1).filter(e => e != null);
      s.groundEle = eles.length ? Math.min(...eles) : null;
    });
  }
  // Anchor photos to the track: exported anchors when present, otherwise nearest
  // point in page order, never moving backwards unless the forward match is clearly wrong.
  function anchorPhotos(exported) {
    const byId = {};
    (exported || []).forEach(a => { byId[a.id] = a; });
    let last = 0;
    photos.forEach(p => {
      const a = byId[p.id];
      if (a && SEGMENTS[a.leg]) {
        p.idx = Math.min(SEGMENTS[a.leg].start + (a.i || 0), SEGMENTS[a.leg].end);
        p.seg = a.leg; p.frac = a.f; p.m = a.f * total; last = p.idx;
        return;
      }
      const here = [p.lon, p.lat];
      let best = -1, bd = Infinity;
      for (let i = last; i < pts.length; i++) { const d = hav(here, pts[i]); if (d < bd) { bd = d; best = i; } }
      let ub = -1, ubd = Infinity;
      for (let i = 0; i < last; i++) { const d = hav(here, pts[i]); if (d < ubd) { ubd = d; ub = i; } }
      if (ub >= 0 && ubd < bd / 3 && bd > 500) { best = ub; bd = ubd; }
      if (best < 0) best = 0;
      p.idx = best; p.seg = segOf[best]; p.frac = total ? cum[best] / total : 0; p.m = cum[best];
      last = best;
    });
  }
  const segCoords = (a, b) => { const out = []; for (let s = a; s <= b; s++) out.push(SEGMENTS[s].coords); return out; };
  const segDist = s => s.dist_m != null ? s.dist_m : (cum[s.end] - cum[s.start]);

  // ------------------------------------------------------------ view (what the reader is looking at)
  function currentItem() {
    const y = innerHeight * 0.45;
    let best = null, bd = Infinity;
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      const d = (r.top <= y && r.bottom >= y) ? 0 : Math.min(Math.abs(r.top - y), Math.abs(r.bottom - y));
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function headlineSeg(a, b) {
    let best = a, bd = -1;
    for (let s = a; s <= b; s++) if (SEGMENTS[s].mode !== 'stop' && segDist(SEGMENTS[s]) > bd) { bd = segDist(SEGMENTS[s]); best = s; }
    return best;
  }
  // The view before the first photo, and on the docked map: the whole day, with the dot at its start.
  const dayStartView = region => ({ kind: 'start', region: !!region, photoIdx: -1, segs: [0, SEGMENTS.length - 1], capSeg: 0, dot: pts[0], frac: 0, m: 0, transit: true });

  // At the top of the page, before the reader scrolls, when the site sets a region to open on.
  const atRegion = () => CFG.startSpanKm > 0 && scrollY < REGION_SCROLL_PX;

  // The whole day in a line: its main ways of travel and its total ("Flying, driving, and more · 9,097 km /
  // 5,653 mi"), and the mode to show its icon (see `modeSummary` in track-common.js).
  function daySummary() {
    const sum = modeSummary(SEGMENTS.map(s => ({ mode: s.mode, m: segDist(s) })));
    if (!sum) return { head: fmtBoth(distM), mode: SEGMENTS[0].mode };
    return { head: `${sum.ways} · ${fmtBoth(distM)}`, mode: sum.mode };
  }

  function computeView(it) {
    if (!it || !pts.length) return null;

    // At the top of the page, the region, even when a photo is already nearest the reading line.
    if (atRegion()) return dayStartView(true);
    const i = items.indexOf(it);
    const mk = (kind, pi, segs, capSeg, dot, transit) => {
      const p = pi >= 0 ? photos[pi] : null;
      return { kind, photoIdx: pi, segs, capSeg, dot, frac: p ? p.frac : 0, m: p ? p.m : 0, transit: !!transit };
    };
    if (it.photo) {
      const p = it.photo, pi = photos.indexOf(p);
      if (clipActive(p)) return clipView(p, pi);
      return mk('photo', pi, [p.seg, p.seg], p.seg, [p.lon, p.lat]);
    }
    let prev = null, next = null;
    for (let k = i - 1; k >= 0; k--) if (items[k].photo) { prev = items[k].photo; break; }
    for (let k = i + 1; k < items.length; k++) if (items[k].photo) { next = items[k].photo; break; }
    const last = SEGMENTS.length - 1;
    // Before the first photo: the whole day, with the dot at its start.
    if (!prev) return dayStartView();
    const pi = photos.indexOf(prev);
    if (!next) {
      if (prev.seg === last) return mk('photo', pi, [last, last], last, [prev.lon, prev.lat]);
      const a = prev.seg + 1;
      return mk('transit', pi, [a, last], headlineSeg(a, last), [prev.lon, prev.lat], true);
    }
    if (next.seg <= prev.seg) return mk('photo', pi, [prev.seg, prev.seg], prev.seg, [prev.lon, prev.lat]);
    return mk('transit', pi, [prev.seg + 1, next.seg], headlineSeg(prev.seg + 1, next.seg), [prev.lon, prev.lat], true);
  }
  const viewIdx = v => v ? (v.idx != null ? v.idx : (v.photoIdx >= 0 ? photos[v.photoIdx].idx : 0)) : 0;

  // ------------------------------------------------------------ flight videos
  // A flight video's clip (docs/track-format.md §2.6) has one sample per second of the video: how far along the
  // day, how fast, and how high. Once the reader has started the video, and while it is the item in view, the map
  // follows it, and the caption shows the speed and altitude.
  const clipActive = p => !!(p.clip && (p.video.played.length || p.video.currentTime > 0));
  function clipView(p, pi) {
    const c = p.clip, n = c.f.length;
    const t = Math.min(Math.max(p.video.currentTime || 0, 0), n - 1), k = Math.min(Math.floor(t), Math.max(n - 2, 0));
    const u = n > 1 ? t - k : 0;
    const lerp = a => a[k] + ((k + 1 < n ? a[k + 1] : a[k]) - a[k]) * u;

    // Altitude only between two good samples.
    const alt = c.alt && c.alt[k] != null && (u === 0 || c.alt[Math.min(k + 1, n - 1)] != null) ? lerp(c.alt.map(a => a == null ? 0 : a)) : null;
    const frac = lerp(c.f), m = frac * total;
    const { idx, dot } = pointAt(m, c.leg);

    // The phase whose start is the latest at or before the playhead.
    let phase = null;
    for (const [at, ph] of c.phase || []) if (at <= t) phase = ph;
    return { kind: 'clip', photoIdx: pi, segs: [c.leg, c.leg], capSeg: c.leg, dot, frac, m, idx, transit: false, kmh: lerp(c.kmh), alt, phase };
  }
  // What a clip's phase is called in the caption; `flying` keeps the leg's mode name.
  const PHASE_NAMES = { taxi: 'Taxiing', takeoff: 'Taking off', landing: 'Landing' };
  // The position `m` metres along the (thinned) track, within leg `seg`, and the index of the point before it.
  function pointAt(m, seg) {
    const { start, end } = SEGMENTS[seg];
    let lo = start, hi = end;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= m) lo = mid; else hi = mid - 1; }
    if (lo >= end) return { idx: end, dot: pts[end] };
    const a = pts[lo], b = pts[lo + 1], span = cum[lo + 1] - cum[lo], u = span > 0 ? Math.min(Math.max((m - cum[lo]) / span, 0), 1) : 0;
    return { idx: lo, dot: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] };
  }
  function attachClips(clips) {
    (clips || []).forEach(c => {
      const p = photos.find(q => q.id === c.id), video = p && p.el.querySelector('video');
      if (!video || !SEGMENTS[c.leg] || !Array.isArray(c.f) || !c.f.length || !Array.isArray(c.kmh)) return;
      p.clip = c; p.video = video;
      ['play', 'pause', 'ended', 'seeked', 'timeupdate'].forEach(ev => video.addEventListener(ev, onClipEvent));
    });
  }
  // `timeupdate` fires only a few times a second, so while a clip plays the view is refreshed about ten times a second.
  let clipLoop = 0;
  function onClipEvent() {
    onScroll();
    const playing = () => photos.some(p => p.video && !p.video.paused && !p.video.ended);
    if (clipLoop || !playing()) return;
    let last = 0;
    const tick = now => {
      if (!playing()) { clipLoop = 0; onScroll(); return; }
      if (now - last >= 100) { last = now; onScroll(); }
      clipLoop = requestAnimationFrame(tick);
    };
    clipLoop = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------ map data
  const lineOrEmpty = coords => coords.length > 1
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
    : { type: 'FeatureCollection', features: [] };
  const linesFC = lists => ({ type: 'FeatureCollection', features: lists.filter(c => c.length > 1).map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) });
  // During a flight video the dot sits between track points, and the lines split exactly there rather than at the
  // point before it, so the traveled line keeps up with the video.
  const splitDot = v => v && v.kind === 'clip' && viewIdx(v) < pts.length - 1 ? v.dot : null;
  const doneData = v => { const d = splitDot(v), c = pts.slice(0, viewIdx(v) + 1); return lineOrEmpty(d ? c.concat([d]) : c); };
  const aheadData = v => { const d = splitDot(v), i = viewIdx(v); return lineOrEmpty(d ? [d].concat(pts.slice(i + 1)) : pts.slice(i)); };
  // the current leg(s), split at the reader's position: `done` is drawn bright, the rest dim
  const currentLegData = v => {
    if (!v) return { type: 'FeatureCollection', features: [] };
    const at = viewIdx(v), d = splitDot(v);
    const doneF = [], aheadF = [];
    const add = (list, coords, done) => { if (coords.length > 1) list.push({ type: 'Feature', properties: { done }, geometry: { type: 'LineString', coordinates: coords } }); };
    for (let s = v.segs[0]; s <= v.segs[1]; s++) {
      const { start, end } = SEGMENTS[s];
      const mid = d && at >= start && at < end;
      add(doneF, pts.slice(start, Math.min(at, end) + 1).concat(mid ? [d] : []), true);
      add(aheadF, mid ? [d].concat(pts.slice(at + 1, end + 1)) : pts.slice(Math.max(at, start), end + 1), false);
    }
    // features draw in order, so the travelled part goes last and stays on top where the route doubles back
    return { type: 'FeatureCollection', features: aheadF.concat(doneF) };
  };
  // direction of forward travel at a track point, degrees clockwise from north, or null at the very end:
  // from the point to wherever the track is about 50 m further on, so a jitter or a tight zigzag right
  // after the point does not swing the arrow
  const bearingAt = i => {
    i = Math.max(0, Math.min(i, pts.length - 1));
    if (i >= pts.length - 1) return null;
    let j = i + 1;
    while (j < pts.length - 1 && cum[j] - cum[i] < 50) j++;
    const a = pts[i], b = pts[j];
    const dx = (b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), dy = b[1] - a[1];
    return (dx === 0 && dy === 0) ? null : Math.atan2(dx, dy) * 180 / Math.PI;
  };
  const dotData = v => {
    const b = bearingAt(viewIdx(v));
    return { type: 'Feature', properties: { bearing: b == null ? 0 : b, arrow: b == null ? 0 : 1 }, geometry: { type: 'Point', coordinates: v ? v.dot : pts[0] } };
  };
  // the photo chosen with the arrows, ringed in the current-leg colour
  const selectedData = () => {
    const s = browseStep != null ? STEPS[browseStep] : null;
    if (!s || s.kind !== 'photos') return { type: 'FeatureCollection', features: [] };
    // the photo whose card is up gets the bright ring, drawn last; the rest of its cluster a darker one beneath
    const ring = (i, primary) => ({ type: 'Feature', properties: { primary }, geometry: { type: 'Point', coordinates: [photos[i].lon, photos[i].lat] } });
    return { type: 'FeatureCollection', features: s.group.slice(1).map(i => ring(i, 0)).concat([ring(s.group[0], 1)]) };
  };
  // In the docked and expanded views, the flight video whose stretch of track the map and the progress bar highlight:
  // the step or item in view, if it is a video with a clip.
  const clipFocus = () => {
    if (placement === 'corner') return null;
    const s = browseStep != null ? STEPS[browseStep] : null;
    const idxs = s ? (s.kind === 'photos' ? s.group : []) : (view && view.photoIdx >= 0 ? [view.photoIdx] : []);
    return idxs.map(i => photos[i]).find(q => q && q.clip) || null;
  };
  const clipData = () => {
    const p = clipFocus();
    return p ? lineOrEmpty(clipCoords(p)) : { type: 'FeatureCollection', features: [] };
  };
  // The track under a flight video, from its first frame to its last.
  const clipCoords = p => {
    const c = p.clip, a = pointAt(c.f[0] * total, c.leg), b = pointAt(c.f[c.f.length - 1] * total, c.leg);
    return [a.dot, ...pts.slice(a.idx + 1, b.idx + 1), b.dot];
  };
  function doneGradient(v) {
    const accent = tok('accent'), dim = tok('accent-dim'), e = 0.0004;
    const flat = c => ['interpolate', ['linear'], ['line-progress'], 0, c, 1, c];
    if (!v) return flat(accent);
    const doneLen = splitDot(v) ? v.m : cum[viewIdx(v)], legStart = cum[SEGMENTS[v.capSeg].start];
    const f = doneLen > 0 ? Math.min(Math.max(legStart / doneLen, 0), 1) : 0;
    if (f <= e) return flat(accent);
    if (f >= 1 - e) return flat(dim);
    return ['interpolate', ['linear'], ['line-progress'], 0, dim, f - e / 2, dim, f + e / 2, accent, 1, accent];
  }
  const photoColorExpr = (curIdx, capSeg) => {
    const cur = tok('current');
    const seg = capSeg == null ? 0 : capSeg;
    return ['case', ['==', ['get', 'seg'], seg], cur, ['<', ['get', 'seg'], seg], tok('accent-dim'), ['<=', ['get', 'i'], curIdx], tok('accent'), tok('ahead')];
  };

  // The whole-day view has the whole day current, so every photo is too.
  const photoColorFor = v => v && v.kind === 'start' ? tok('current') : photoColorExpr(v ? v.photoIdx : -1, v ? v.capSeg : 0);

  const parkOutlines = () => PARKS.flatMap(p => p.polys.map(poly => poly[0]));
  const parksData = () => ({ type: 'FeatureCollection', features: PARKS.map(p => ({ type: 'Feature', properties: { name: p.name || '' }, geometry: { type: 'MultiPolygon', coordinates: p.polys } })) });
  // Under the basemap's labels, so place names stay readable over the shading.
  function parkLayers() {
    if (!PARKS.length) return [];
    return [
      { id: 'es-park-fill', type: 'fill', source: 'parks', paint: { 'fill-color': tok('park-fill') } },
    ];
  }
  function ourSources() {
    const cur = view;
    return {
      track: { type: 'geojson', data: lineOrEmpty(pts) },
      done: { type: 'geojson', lineMetrics: true, data: doneData(cur) },
      ahead: { type: 'geojson', data: aheadData(cur) },
      current: { type: 'geojson', data: currentLegData(cur) },
      photos: { type: 'geojson', data: { type: 'FeatureCollection', features: photos.map((p, i) => ({ type: 'Feature', properties: { i, seg: p.seg, id: p.id }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) } },
      dot: { type: 'geojson', data: dotData(cur) },
      selected: { type: 'geojson', data: selectedData() },
      clip: { type: 'geojson', data: clipData() },
      parks: { type: 'geojson', data: parksData() },
    };
  }
  function ourLayers() {
    const big = placement !== 'corner';
    // The current leg is drawn in its own colour on top of the traveled/ahead lines, in every view.
    const cur = tok('current');
    const layers = [
      { id: 'es-track-casing', type: 'line', source: 'track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': tok('casing'), 'line-width': big ? 6 : 4.8 } },
      // the halo is opaque: a translucent one compounds with itself wherever the route doubles back, leaving bright fuzzy patches
      { id: 'es-current-halo', type: 'line', source: 'current', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': tok('current-halo'), 'line-width': big ? 16 : 12, 'line-blur': 1.5 } },
      { id: 'es-track-ahead', type: 'line', source: 'ahead', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': tok('ahead'), 'line-width': big ? 3.5 : 3 } },
      { id: 'es-track-done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': big ? 3.5 : 3, 'line-gradient': doneGradient(view) } },
    ];
    layers.push({ id: 'es-current-line', type: 'line', source: 'current', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['get', 'done'], cur, tok('current-dim')], 'line-width': big ? 3.5 : 3 } });

    // The stretch a flight video covers, over the track and under the dots.
    layers.push({ id: 'es-clip-line', type: 'line', source: 'clip', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': tok('dot'), 'line-width': 4 } });
    if (CFG.dots) {
      layers.push({ id: 'es-photos', type: 'circle', source: 'photos', paint: { 'circle-radius': big ? 5 : 3, 'circle-color': photoColorFor(view), 'circle-stroke-color': tok('ground-deep'), 'circle-stroke-width': 1 } });
      layers.push({ id: 'es-photos-hit', type: 'circle', source: 'photos', paint: { 'circle-radius': big ? 12 : 6, 'circle-opacity': 0 } });
    }
    if (big) layers.push({ id: 'es-track-hit', type: 'line', source: 'track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 18, 'line-opacity': 0 } });
    layers.push({ id: 'es-selected', type: 'circle', source: 'selected', paint: { 'circle-radius': 11, 'circle-color': cur, 'circle-opacity': 0, 'circle-stroke-color': ['case', ['==', ['get', 'primary'], 1], cur, tok('current-dim')], 'circle-stroke-width': 3 } });
    layers.push({ id: 'es-dot-halo', type: 'circle', source: 'dot', paint: { 'circle-radius': big ? 14 : 11, 'circle-color': cur, 'circle-opacity': .3, 'circle-blur': .4 } });
    // the same outer ring the selected photo gets, so the position dot reads as highlighted the same way
    layers.push({ id: 'es-dot-ring', type: 'circle', source: 'dot', paint: { 'circle-radius': 11, 'circle-color': cur, 'circle-opacity': 0, 'circle-stroke-color': cur, 'circle-stroke-width': 3 } });
    layers.push({ id: 'es-dot', type: 'circle', source: 'dot', paint: { 'circle-radius': big ? 6 : 5, 'circle-color': tok('dot'), 'circle-stroke-color': cur, 'circle-stroke-width': 2.5 } });
    // a small arrow just ahead of the position dot, pointing the way the traveller went next (none at the end of the day)
    layers.push({ id: 'es-dot-arrow', type: 'symbol', source: 'dot', filter: ['==', ['get', 'arrow'], 1], layout: { 'icon-image': 'es-arrow-current', 'icon-size': big ? 1.1 : .85, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-offset': [0, big ? -16 : -13], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    return layers;
  }

  // ------------------------------------------------------------ basemap
  // The basemap itself (OpenFreeMap, trimmed and recoloured, with hillshade) is shared with the section map in
  // track-common.js.
  async function loadBaseStyle() {
    baseStyle = await window.esTrack.loadBasemap(CFG, tok);
    if (!baseStyle) showNotice('Map tiles unavailable. Showing the route alone.');
  }
  function buildStyle() {
    // full detail only when expanded to the modal; minimal elsewhere
    const detail = placement === 'expanded' ? 'standard' : (CFG.detail || 'minimal');
    const style = window.esTrack.basemapStyle(baseStyle, { cfg: CFG, tok, detail });
    Object.assign(style.sources, ourSources());
    const labels = style.layers.findIndex(l => l.type === 'symbol');
    style.layers.splice(labels < 0 ? style.layers.length : labels, 0, ...parkLayers());
    window.esTrack.addRegion(style, REGION, tok);
    style.layers.push(...ourLayers());
    widget.classList.toggle('basemap-muted', detail !== 'standard');
    return style;
  }
  function setInteractive(on) {
    ['scrollZoom', 'dragPan', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'boxZoom', 'touchPitch'].forEach(h => { if (map[h]) on ? map[h].enable() : map[h].disable(); });
    if (map.touchZoomRotate) map.touchZoomRotate.disableRotation();
    if (map.dragRotate) map.dragRotate.disable();
  }

  // ------------------------------------------------------------ camera and rendering
  function boundsOf(coordLists, extra) {
    const b = new maplibregl.LngLatBounds();
    coordLists.forEach(cs => cs.forEach(c => b.extend(c)));
    if (extra) extra.forEach(c => b.extend(c));
    return b;
  }
  // The whole day and any park the page highlights, widened about its centre to at least DAY_MIN_SPAN_M across.
  function dayBounds() {
    const b = boundsOf([pts, ...parkOutlines()]), c = b.getCenter();
    aroundBounds([c.lng, c.lat], DAY_MIN_SPAN_M / 2).forEach(corner => b.extend(corner));
    return b;
  }

  // The day's region: the whole day, widened about its centre to at least `start_span_km` across.
  function regionBounds() {
    const b = dayBounds(), c = b.getCenter();
    aroundBounds([c.lng, c.lat], CFG.startSpanKm * 1000 / 2).forEach(corner => b.extend(corner));
    return b;
  }

  // The least zoom the map allows is normally 1, so the big map can't be zoomed out past the world. A day that spans
  // more of the globe than fits at zoom 1 (a long flight, especially on a phone's 76 px map) lowers it to the zoom
  // that shows the whole day, down to MapLibre's least (-2), so the reader can always zoom back out to the whole day.
  const MIN_ZOOM = 1, LEAST_ZOOM = -2;
  const floorZoom = z => Math.max(LEAST_ZOOM, Math.min(MIN_ZOOM, z));

  // The zoom that shows the whole day in the map at its present size.
  function wholeDayZoom() {
    const cam = map.cameraForBounds(dayBounds(), { padding: isPhone() ? 14 : 26 });
    return cam ? cam.zoom : MIN_ZOOM;
  }

  // `map.fitBounds`, first lowering the least zoom when the fit needs it. Stopping any move under way first lets its
  // 'moveend' raise the least zoom before this fit lowers it, not partway through this fit.
  function fit(bounds, opts) {
    map.stop();
    const cam = map.cameraForBounds(bounds, { padding: opts.padding });
    if (cam && cam.zoom < map.getMinZoom()) map.setMinZoom(floorZoom(cam.zoom));
    map.fitBounds(bounds, opts);
  }

  function fitAll(pad) { if (mapReady) fit(dayBounds(), { padding: pad, duration: animMs(900), maxZoom: 15 }); }
  // Whether `p` ([lon, lat]) lies inside `ring`, by ray casting.
  function inRing(ring, p) {
    let inside = false;
    for (let k = 1; k < ring.length; k++) {
      const [x0, y0] = ring[k - 1], [x1, y1] = ring[k];
      if ((y0 > p[1]) !== (y1 > p[1]) && p[0] < x0 + (p[1] - y0) / (y1 - y0) * (x1 - x0)) inside = !inside;
    }
    return inside;
  }
  // The highlighted park the day starts in, if any: inside an outline and not in one of its holes.
  const startPark = () => pts.length ? PARKS.find(p => p.polys.some(poly => inRing(poly[0], pts[0]) && !poly.slice(1).some(h => inRing(h, pts[0])))) : null;
  // The expanded map opens on the park the day starts in, if it does; otherwise, and when docked, on the whole day.
  function fitOpening(pad) {
    const park = placement === 'expanded' ? startPark() : null;
    if (!park) return fitAll(pad);
    if (mapReady) fit(boundsOf(park.polys.map(poly => poly[0]), [pts[0]]), { padding: pad, duration: animMs(900), maxZoom: 15 });
  }
  // How far to show around the aircraft, in metres. A floatplane on the water, or a log whose altitude is nonsense
  // (negative), falls back to the video's speed or the mode's default.
  function flightRadius(v) {
    const clamp = m => Math.min(Math.max(m, 3000), 80000);
    const alt = v.kind === 'clip' ? v.alt : eleAt[viewIdx(v)];
    if (alt != null && alt > 0) return clamp(alt * 10);
    if (v.kind === 'clip' && v.kmh) return clamp(v.kmh / 3.6 * 180);
    return FLIGHT_RADIUS_M[SEGMENTS[v.capSeg].mode];
  }
  // Bounds reaching `r` metres from `c` ([lon, lat]) each way.
  const aroundBounds = (c, r) => {
    const dLat = r / 111320, dLon = r / (111320 * Math.cos(c[1] * Math.PI / 180));
    return [[c[0] - dLon, c[1] - dLat], [c[0] + dLon, c[1] + dLat]];
  };
  let lastFlight = null;  // the centre and radius the flight camera last framed
  let cameraJumps = false;  // while the map first loads: move the camera straight to its framing, without animating
  const animMs = ms => RM || cameraJumps ? 0 : ms;
  function applyCamera(force) {
    if (!mapReady || !view || placement !== 'corner' || collapsed) return;
    let key, bounds;
    const pad = isPhone() ? 14 : 26;
    if (view.kind === 'start') {
      const key = view.region ? 'region' : 'day';
      if (!force && lastCamKey === key) return;
      lastCamKey = key;
      fit(view.region ? regionBounds() : dayBounds(), { padding: pad, duration: animMs(1100), maxZoom: 15, essential: true });
      return;
    }

    if (!view.transit && FLIGHT_RADIUS_M[SEGMENTS[view.capSeg].mode]) {
      // Re-frame only when the aircraft has moved a third of the radius, or the radius has changed by half, so the
      // map doesn't swim while a video plays.
      const r = flightRadius(view), c = view.dot;
      const same = lastFlight && lastCamKey === 'f' + view.capSeg && hav(lastFlight.c, c) < lastFlight.r / 3 && Math.abs(Math.log(r / lastFlight.r)) < Math.log(1.5);
      if (!force && same) return;
      lastFlight = { c, r };
      lastCamKey = 'f' + view.capSeg;
      fit(aroundBounds(c, r), { padding: 0, duration: animMs(1100), maxZoom: 14.5, essential: true });
      return;
    }
    if (!view.transit) {
      key = 'c' + view.capSeg;
      const ps = photos.filter(p => p.seg === view.capSeg).map(p => [p.lon, p.lat]);
      bounds = boundsOf([ps.length ? ps : [view.dot]], [view.dot]);
    } else {
      key = 's' + view.segs.join('-');
      bounds = boundsOf(segCoords(view.segs[0], view.segs[1]), [view.dot]);
    }
    if (!force && key === lastCamKey) return;
    lastCamKey = key;
    fit(bounds, { padding: pad, duration: animMs(1100), maxZoom: view.transit ? 15.5 : 14.5, essential: true });
  }
  function positionProgressLabels() {
    if (!view) return;
    const band = document.getElementById('es-track-progress'), cur = document.getElementById('es-track-cur'), tot = document.getElementById('es-track-tot');
    // label with the published distance, scaled from the thinned points' own measure
    cur.textContent = fmtLike(total ? view.m * distM / total : view.m, distM);
    tot.textContent = fmtBoth(distM);
    // at the end of the track the two labels would say the same thing: show just the total, in green
    const atEnd = total > 0 && view.m >= total - 1;
    tot.classList.toggle('is-done', atEnd);
    cur.hidden = atEnd;
    if (atEnd) { tot.hidden = false; return; }
    const W = band.clientWidth; if (!W) return;
    const x = view.frac * W, cw = cur.offsetWidth, tw = tot.offsetWidth;
    let left = Math.max(0, Math.min(W - cw, x - cw / 2));
    const totLeft = W - tw;
    tot.hidden = false;
    if (left + cw > totLeft - 6) {
      left = totLeft - 6 - cw;
      if (left < 0) { left = Math.max(0, Math.min(W - cw, x - cw / 2)); tot.hidden = true; }
    }
    cur.style.left = left + 'px';
  }
  function applyView(force) {
    if (!view) return;
    const seg = SEGMENTS[view.capSeg], md = MODES[seg.mode];

    // The whole-day view sums up the day instead of describing its first leg.
    const summary = view.kind === 'start' ? daySummary() : null;
    const iconMd = summary ? MODES[summary.mode] : md;
    document.getElementById('es-track-ico').innerHTML = iconSvg(iconMd ? iconMd.icon : 'route');
    // No clock times in public. A duration appears only on flights and boat rides, on the
    // second line between the endpoints: "ATL → 14h 15min → CPT".
    const showDur = TIMED.includes(seg.mode) && seg.dur_s;
    let head;
    if (summary) head = summary.head;
    else if (seg.mode === 'stop') head = seg.label || md.name;
    else if (view.kind === 'clip') {
      const name = PHASE_NAMES[view.phase] || (md ? md.name : '');
      head = `${name ? name + ' · ' : ''}${fmtSpeed(view.kmh)}`;
    }
    else head = `${md ? md.name + ' · ' : ''}${fmtBoth(segDist(seg))}`;
    let sub = seg.mode === 'stop' ? '' : (seg.label || '');
    if (summary) sub = CFG.route || '';
    else if (view.kind === 'clip' && view.alt != null && view.phase !== 'taxi') sub = `Altitude ${fmtAlt(view.alt)}`;
    else if (showDur) {
      const m = sub.match(/^(.*?)\s*(→|->|⟶|–)\s*(.*)$/);
      sub = m ? `${m[1]} ${m[2]} ${fmtDur(seg.dur_s)} ${m[2]} ${m[3]}` : (sub ? `${sub} · ${fmtDur(seg.dur_s)}` : fmtDur(seg.dur_s));
    }
    // Labels come from a fetched document: always text, never markup.
    const text = document.getElementById('es-track-text');
    text.replaceChildren();
    const modeEl = document.createElement('span'); modeEl.className = 'mode'; modeEl.textContent = head; text.appendChild(modeEl);
    if (sub) { const labelEl = document.createElement('span'); labelEl.className = 'label'; labelEl.textContent = sub; text.appendChild(labelEl); }

    // On a flight leg, a line for the altitude where the photo was taken, where the log's altitude is believed and
    // at least 50 m above the leg's ground level, so not at the gate or on the water (a flight video's caption shows
    // its own).
    const photoAlt = !summary && view.kind !== 'clip' && FLIGHT_RADIUS_M[seg.mode] ? eleAt[viewIdx(view)] : null;
    if (photoAlt != null && seg.groundEle != null && photoAlt - seg.groundEle >= 50) {
      const altEl = document.createElement('span'); altEl.className = 'label altitude';
      altEl.textContent = `Altitude ${fmtAlt(photoAlt)}`;
      text.appendChild(altEl);
    }

    // On foot, a line for the leg's climb and descent (the JSON's `gain_m` and `loss_m`): the main direction, and
    // the other only when it is at least 10 m.
    if (!summary && view.kind !== 'clip' && seg.gain_m != null && seg.loss_m != null && (seg.gain_m || seg.loss_m)) {
      const up = seg.gain_m >= seg.loss_m;
      const parts = [];
      if (up || seg.gain_m >= 10) parts.push(`↑ ${fmtAlt(seg.gain_m)}`);
      if (!up || seg.loss_m >= 10) parts.push(`↓ ${fmtAlt(seg.loss_m)}`);
      const climbEl = document.createElement('span'); climbEl.className = 'label climb';
      climbEl.textContent = parts.join(' · ');
      text.appendChild(climbEl);
    }
    badge.querySelector('.es-track-ico').innerHTML = iconSvg(iconMd ? iconMd.icon : 'route');
    const badgeText = badge.querySelector('.es-track-badge-text');
    badgeText.replaceChildren(...Array.from(text.children).map(n => n.cloneNode(true)));
    // A third line when the dot sits at the very start or end of the day, or of a multi-day trip.
    const span = tripDays > 1 ? 'trip' : 'day';
    const dotIdx = viewIdx(view), note = dotIdx <= 0 ? `Start of ${span}` : dotIdx >= pts.length - 1 ? `End of ${span}` : '';
    if (note) { const n = document.createElement('span'); n.className = 'note'; n.textContent = note; badgeText.appendChild(n); }
    document.getElementById('es-track-fill').style.width = (view.frac * 100).toFixed(2) + '%';
    // current leg's span on the bar: green up to the reader's position, darker green beyond
    const legA = summary || !total ? 0 : cum[seg.start] / total, legB = summary ? 1 : total ? cum[seg.end] / total : 0;
    const at = Math.min(Math.max(view.frac, legA), legB);
    const pct = x => (x * 100).toFixed(2) + '%';
    const done = document.getElementById('es-track-leg-done'), ahead = document.getElementById('es-track-leg-ahead');
    done.style.left = pct(legA); done.style.width = pct(at - legA);
    ahead.style.left = pct(at); ahead.style.width = pct(legB - at);
    const clipP = clipFocus(), clipSpan = document.getElementById('es-track-clip');
    clipSpan.hidden = !clipP;
    if (clipP) { const f = clipP.clip.f; clipSpan.style.left = pct(f[0]); clipSpan.style.width = pct(f[f.length - 1] - f[0]); }
    positionProgressLabels();
    const stepAt = browseStep == null ? stepIndexFor(view) : browseStep;
    document.getElementById('es-track-step-label').textContent = stepLabel(stepAt);

    // The arrows dim at either end of the day: back at the whole day, onward at its end.
    document.getElementById('es-track-prev').disabled = stepAt < 0;
    document.getElementById('es-track-next').disabled = stepAt >= STEPS.length - 1;
    if (!mapReady) return;
    map.getSource('dot').setData(dotData(view));
    map.getSource('current').setData(currentLegData(view));
    if (map.getSource('selected')) map.getSource('selected').setData(selectedData());
    if (map.getSource('clip')) map.getSource('clip').setData(clipData());
    const gradKey = viewIdx(view) + ':' + view.capSeg + (splitDot(view) ? ':' + view.m : '');
    if (force || gradKey !== lastGrad) {
      lastGrad = gradKey;
      map.getSource('done').setData(doneData(view));
      map.getSource('ahead').setData(aheadData(view));
      map.setPaintProperty('es-track-done', 'line-gradient', doneGradient(view));
    }
    const dotKey = view.kind === 'start' ? 'day' : view.photoIdx + ':' + view.capSeg;
    if (CFG.dots && map.getLayer('es-photos') && (force || dotKey !== lastPhotoIdx)) {
      lastPhotoIdx = dotKey;
      map.setPaintProperty('es-photos', 'circle-color', photoColorFor(view));
    }
    applyCamera(force);
    updateBadge();
  }
  // In the big views the position dot gets a badge
  // repeating the caption, so the dot is not a mystery. Hidden whenever the photo card is up.
  let badgeOff = null;
  function updateBadge() {
    // shown whenever the big map has a dot and no photo card: a photo step is about to show its card, so skip it
    const onPhotoStep = browseStep != null && STEPS[browseStep] && STEPS[browseStep].kind === 'photos';
    const want = mapReady && placement !== 'corner' && !collapsed && view && thumb.hidden && !onPhotoStep && window.__esTrackCard;
    badge.hidden = !want;
    placeStep();
    if (!want) { badgeOff = null; badgeTail.toggleAttribute('hidden', true); return; }
    // direction of travel at the anchor, in screen space, so the badge can sit beside it on the side behind it
    const i = badgeAnchorIdx(), a = project(pts[Math.max(0, i - 3)]), b = project(pts[Math.min(pts.length - 1, i + 3)]);
    badgeAt = pts[i];
    badgeOff = window.__esTrackCard.placeNear(badge, badgeAt, { sides: true, gap: 34, travel: { x: b.x - a.x, y: b.y - a.y } });
    drawBadgeTail();
  }

  // On a phone, the full-screen map's step controls ride just under the badge or the photo card, where the reader is
  // already looking, rather than in the status bar. While neither is up (the camera moving between steps), they stay
  // where they were rather than jumping to the bar and back. Everywhere else, they're in the bar.
  const stepEl = widget.querySelector('.es-track-step'), stepHome = stepEl.parentNode, stepBefore = stepEl.nextElementSibling;
  function placeStep() {
    const riding = placement === 'expanded' && isPhone();
    const host = !riding ? stepHome : !thumb.hidden ? thumb : !badge.hidden ? badge : stepEl.parentNode;
    if (stepEl.parentNode === host) return;
    if (host === stepHome) stepHome.insertBefore(stepEl, stepBefore);
    else host.appendChild(stepEl);
  }

  // A tap between the arrows must not reach the photo card, which opens its photo.
  stepEl.addEventListener('click', e => e.stopPropagation());

  // Where the badge points. Normally the dot. When stepping onto a leg that has no photos of its own (and is not
  // the first leg of the day, whose badge marks the start), the badge labels the leg itself from its midpoint.
  let badgeAt = null;
  function badgeAnchorIdx() {
    const s = browseStep != null ? STEPS[browseStep] : null;
    if (s && s.kind === 'leg' && s.leg > 0 && !photos.some(p => p.seg === s.leg)) {
      const seg = SEGMENTS[s.leg], mid = (cum[seg.start] + cum[seg.end]) / 2;
      let k = seg.start;
      while (k < seg.end && cum[k + 1] <= mid) k++;
      return k;
    }
    return viewIdx(view);
  }
  // a funnel from the badge's nearest edge to just short of the dot, whatever the offset the clamping left
  function drawBadgeTail() { drawTail(badgeTail, badge, view && badgeAt); }
  // a funnel from an overlay's nearest edge to just short of the point it belongs to, whatever offset the clamping left
  function drawTail(tail, el, lonlat) {
    // SVG elements have no `hidden` property, so the attribute is toggled directly
    if (el.hidden || !lonlat) { tail.toggleAttribute('hidden', true); return; }
    const pt = project(lonlat), box = map.getContainer().getBoundingClientRect();
    const rx = el.offsetLeft, ry = el.offsetTop, rw = el.offsetWidth, rh = el.offsetHeight;
    const cx = Math.max(rx, Math.min(rx + rw, pt.x)), cy = Math.max(ry, Math.min(ry + rh, pt.y));  // nearest point on the overlay to the point
    const dx = pt.x - cx, dy = pt.y - cy, len = Math.hypot(dx, dy);
    // too close to draw, or so far (the overlay clamped to the edge while its point is elsewhere) that the funnel
    // would stretch across the map: skip it
    if (len < 18 || len > 90) { tail.toggleAttribute('hidden', true); return; }
    const ux = dx / len, uy = dy / len, px = -uy, py = ux, half = 6, stop = 12, inset = 1;
    const ax = pt.x - ux * stop, ay = pt.y - uy * stop;            // apex, short of the point
    const bx = cx - ux * inset, by = cy - uy * inset;              // base centre, tucked under the overlay's border
    tail.setAttribute('width', box.width); tail.setAttribute('height', box.height);
    tail.querySelector('polygon').setAttribute('points', `${ax},${ay} ${bx + px * half},${by + py * half} ${bx - px * half},${by - py * half}`);
    tail.toggleAttribute('hidden', false);
  }
  function followBadge() {
    if (badge.hidden || !badgeOff || !view) return;
    const pt = project(badgeAt || view.dot), box = map.getContainer().getBoundingClientRect(), edge = 4;
    badge.style.left = Math.max(edge, Math.min(box.width - edge - badge.offsetWidth, pt.x + badgeOff.dx)) + 'px';
    badge.style.top = Math.max(edge, Math.min(box.height - edge - badge.offsetHeight, pt.y + badgeOff.dy)) + 'px';
    drawBadgeTail();
  }
  let ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (browseStep != null && placement !== 'corner') { updateOverlap(); return; }
      const v = placement === 'docked' ? dayStartView() : computeView(currentItem());
      const moved = v && view && v.kind === 'clip' && (v.frac !== view.frac || v.kmh !== view.kmh || v.alt !== view.alt || v.phase !== view.phase);
      if (v && (!view || moved || v.kind !== view.kind || v.region !== view.region || v.photoIdx !== view.photoIdx || v.segs[0] !== view.segs[0] || v.segs[1] !== view.segs[1])) { view = v; applyView(false); }
      updateOverlap();
    });
  }
  function updateOverlap() {
    if (placement !== 'corner' || !CFG.dim || isPhone()) { widget.classList.remove('over-photo'); return; }
    const w = widget.getBoundingClientRect();
    let over = false;
    for (const p of photos) {
      const img = p.el.querySelector('img, video'); if (!img) continue;
      const r = img.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      if (r.left < w.right && r.right > w.left && r.top < w.bottom && r.bottom > w.top) { over = true; break; }
    }
    widget.classList.toggle('over-photo', over);
  }

  // ------------------------------------------------------------ placement: corner ⇄ docked ⇄ expanded
  function place() {
    const target = expanded ? 'expanded' : (slotVisible ? 'docked' : 'corner');
    if (placedOnce && target === placement) return;
    placedOnce = true;
    const from = placement;
    placement = target;
    if (browseStep != null) { browseStep = null; view = computeView(currentItem()) || view; }

    // The docked map shows the whole day from its start; leaving it for the corner picks up the article again.
    if (target === 'docked' && pts.length) view = dayStartView();
    else if (target === 'corner' && from === 'docked') view = computeView(currentItem()) || view;

    widget.classList.remove('is-corner', 'is-docked', 'is-expanded');
    widget.classList.add('is-' + target);
    (target === 'corner' ? document.body : target === 'docked' ? slot : modal).appendChild(widget);
    modal.hidden = target !== 'expanded';
    document.body.style.overflow = target === 'expanded' ? 'hidden' : '';
    thumb.hidden = true;
    placeStep();
    requestAnimationFrame(positionProgressLabels);
    if (!mapReady) return;
    setInteractive(target !== 'corner');
    map.setStyle(buildStyle());
    // When MapLibre can apply the new style as a diff, 'style.load' never fires, so frame the view on whichever of
    // that or the next idle comes first.
    let framed = false;
    const frame = () => {
      if (framed || placement !== target) return;
      framed = true;
      map.resize();
      lastCamKey = null;
      applyView(true);
      if (target !== 'corner') fitOpening(target === 'expanded' ? (isPhone() ? 30 : 70) : 40);
    };
    map.once('style.load', frame);
    map.once('idle', frame);
    requestAnimationFrame(() => map.resize());
  }
  function setCollapsed(v, remember) {
    collapsed = v;
    widget.classList.toggle('is-collapsed', v);
    collapseBtn.setAttribute('aria-expanded', String(!v));
    collapseBtn.setAttribute('aria-label', v ? 'Show map' : 'Collapse map');
    if (remember) { try { localStorage.setItem('es-track-collapsed', v ? '1' : '0'); } catch (e) { /* private mode */ } }
    if (!v && mapReady) requestAnimationFrame(() => { map.resize(); lastCamKey = null; applyCamera(true); });
    updateOverlap();
    updateBadge();
  }

  // ------------------------------------------------------------ map init
  function initMap() {
    map = new maplibregl.Map({ container: 'es-track-canvas', style: buildStyle(), attributionControl: false, fadeDuration: 0, maxZoom: 17, minZoom: LEAST_ZOOM, pitchWithRotate: false, bounds: dayBounds(), fitBoundsOptions: { padding: isPhone() ? 14 : 26, maxZoom: 15 } });
    map.setMinZoom(floorZoom(Math.min(wholeDayZoom(), map.getZoom())));
    setInteractive(false);
    map.on('load', () => {
      mapReady = true; lastCamKey = null; lastGrad = ''; lastPhotoIdx = '';
      setInteractive(placement !== 'corner');
      cameraJumps = true;
      applyView(true);
      if (placement !== 'corner') fitOpening(placement === 'expanded' ? 70 : 40);
      cameraJumps = false;
    });
    map.on('style.load', () => { if (mapReady) { lastCamKey = null; lastGrad = ''; lastPhotoIdx = ''; applyView(true); } });
    map.on('error', e => { const m = (e && e.error && e.error.message) || ''; if (m) console.warn('track-map:', m); });
    // the arrow image is drawn on demand in the colour its name asks for, so it comes back after every style swap
    map.on('styleimagemissing', e => {
      const m = /^es-arrow-(.+)$/.exec(e.id); if (!m || map.hasImage(e.id)) return;
      const size = 28, c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
      g.beginPath(); g.moveTo(14, 4); g.lineTo(23, 22); g.lineTo(14, 17); g.lineTo(5, 22); g.closePath();  // chevron pointing up
      g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = tok('ground-deep'); g.stroke();
      g.fillStyle = tok(m[1]); g.fill();
      map.addImage(e.id, g.getImageData(0, 0, size, size), { pixelRatio: 2 });
    });
    map.on('movestart', () => widget.classList.add('is-moving'));
    map.on('move', followBadge);
    // funnels fade back in once settled: a move that starts before the previous one has finished keeps them hidden
    map.on('moveend', () => { updateBadge(); requestAnimationFrame(() => { if (!map.isMoving()) widget.classList.remove('is-moving'); }); });

    // Once the map settles (and after a resize, when the map changes placement), the least zoom is the one that shows
    // the whole day at the map's present size, or 1 if that's closer in. A fit that went further out (the region at
    // the top of the page) keeps its own until the map is closer in than the whole day, so the least zoom never
    // rises above where the map is and never makes it jump.
    map.on('moveend', () => { if (!map.isMoving()) map.setMinZoom(floorZoom(Math.min(wholeDayZoom(), map.getZoom()))); });

    // Photos whose dots overlap the hovered one at the current zoom, in page order.
    function clusterAt(i) {
      const c = project([photos[i].lon, photos[i].lat]);
      const group = [];
      photos.forEach((p, k) => { const q = project([p.lon, p.lat]); if (Math.hypot(q.x - c.x, q.y - c.y) <= 12) group.push(k); });
      return group.length ? group : [i];
    }
    let hoverGroup = null, hideTimer = null;
    const stepperHoldsCard = () => browseStep != null && STEPS[browseStep] && STEPS[browseStep].kind === 'photos';
    let cardAt = null, cardOff = null;
    function hideCard() { thumb.hidden = true; hoverGroup = null; cardAt = null; thumbTail.toggleAttribute('hidden', true); updateBadge(); }
    // the card keeps its offset from the photo while the map moves, so the funnel stays attached
    function followCard() {
      if (thumb.hidden || !cardAt || !cardOff) return;
      const pt = project(cardAt), box = map.getContainer().getBoundingClientRect(), edge = 4;
      thumb.style.left = Math.max(edge, Math.min(box.width - edge - thumb.offsetWidth, pt.x + cardOff.dx)) + 'px';
      thumb.style.top = Math.max(edge, Math.min(box.height - edge - thumb.offsetHeight, pt.y + cardOff.dy)) + 'px';
      drawTail(thumbTail, thumb, cardAt);
    }
    map.on('move', followCard);

    // While the map moves, the card keeps its offset from the photo, clamped to the map's edges. A card placed
    // mid-move (its image arrived while the camera was still settling) can end up over its own dot once the camera
    // stops, or be clamped onto one of the map's controls: choose its spot again then.
    map.on('moveend', () => {
      if (thumb.hidden || !cardAt || !hoverGroup) return;
      const q = project(cardAt), l = thumb.offsetLeft, t = thumb.offsetTop;
      const overDot = q.x >= l - 6 && q.x <= l + thumb.offsetWidth + 6 && q.y >= t - 6 && q.y <= t + thumb.offsetHeight + 6;
      if (overDot || coversControl(thumb)) placeCard(photos[hoverGroup[0]]);
    });
    function showCard(group) {
      const p = photos[group[0]];
      if (!p) return;
      hoverGroup = group;
      const src = placement === 'corner' ? p.thumb : p.thumbLarge;
      if (src) { if (thumbImg.getAttribute('src') !== src) { thumbImg.style.display = ''; thumbImg.src = src; } }
      else { thumbImg.removeAttribute('src'); thumbImg.style.display = 'none'; }
      thumbLoc.textContent = p.loc || '';
      if (group.length > 1) { const more = document.createElement('span'); more.className = 'more'; more.textContent = `+${group.length - 1} more`; thumbLoc.appendChild(more); }

      // A card that comes up afresh, or for another photo, may make room for itself again.
      if (thumb.hidden || roomMadeFor !== p) roomMadeFor = null;
      thumb.hidden = false;
      placeStep();
      placeCard(p);
      updateBadge();
    }
    // The photo whose card has moved the map to make room for itself, while that card is up.
    let roomMadeFor = null;

    // keep the card inside the map: below the dot when there's no room above, clamped sideways
    function placeCard(p) {
      cardAt = [p.lon, p.lat];
      cardOff = placeNear(thumb, cardAt, { gap: 34 });
      drawTail(thumbTail, thumb, cardAt);

      // A card the stepper holds may move the map to make room for itself (a tall photo on a phone, say), once its
      // image has arrived and set its height. It does so only once while it's up, so it never undoes the reader's
      // own moves of the map. A card under the pointer never does.
      const sized = thumbImg.style.display === 'none' || thumbImg.complete;
      if (!cardOff.clean && roomMadeFor !== p && sized && stepperHoldsCard()) {
        roomMadeFor = p;
        makeRoom(thumb, cardAt, 34, () => { if (!thumb.hidden && hoverGroup && photos[hoverGroup[0]] === p) placeCard(p); });
      }
    }

    // The map's own controls on screen (close or expand, zoom, credits), as boxes in the map's coordinates.
    function controlBoxes() {
      const box = map.getContainer().getBoundingClientRect();
      return Array.from(widget.querySelectorAll('.es-track-map > .es-track-btn, .es-track-zoom, .es-track-attr'))
        .map(c => c.getBoundingClientRect())
        .filter(r => r.width && r.height)
        .map(r => ({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }));
    }

    // Whether the box at (`x`, `y`), `w` by `h`, comes within `pad` of the control box `c`.
    const overControl = (x, y, w, h, c, pad) => x < c.x + c.w + pad && x + w > c.x - pad && y < c.y + c.h + pad && y + h > c.y - pad;
    const coversControl = el => controlBoxes().some(c => overControl(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight, c, 0));

    // returns the chosen offset from the dot so the element can follow it while the map moves
    // opts.sides prefers left/right of the dot over above/below; opts.travel (screen-space direction of
    // travel) then prefers the side the traveller came from, so the badge does not sit in the way ahead
    function placeNear(el, lonlat, opts) {
      opts = opts || {};
      const pt = project(lonlat);
      const box = map.getContainer().getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight, gap = opts.gap || 14, edge = 4, clear = 6;
      const clampX = x => Math.max(edge, Math.min(box.width - edge - w, x));
      const clampY = y => Math.max(edge, Math.min(box.height - edge - h, y));
      const controls = controlBoxes();

      // Candidate spots around the dot, each kept inside the map (so never over the status bar).
      const cands = [
        [pt.x - w / 2, pt.y - gap - h],  // above
        [pt.x - w / 2, pt.y + gap],      // below
        [pt.x + gap, pt.y - h / 2],      // right
        [pt.x - gap - w, pt.y - h / 2],  // left
      ].map(([x, y], side) => ({ x: clampX(x), y: clampY(y), side }));

      // Whether the funnel from the spot to the dot can be drawn well once clamping has moved the spot: the dot still
      // faces the side the spot was chosen for, so the funnel meets that side square on rather than at a corner, and
      // it lies far enough from the dot to show, but not so far that it's left out (see `drawTail`).
      function funnelFits(r) {
        const facing = r.side < 2 ? pt.x >= r.x + 10 && pt.x <= r.x + w - 10 : pt.y >= r.y + 10 && pt.y <= r.y + h - 10;
        const d = Math.hypot(pt.x - Math.max(r.x, Math.min(r.x + w, pt.x)), pt.y - Math.max(r.y, Math.min(r.y + h, pt.y)));
        return facing && d >= 24 && d <= 90;
      }

      // Pick the spot that hides the least of the track and photo dots on screen, and never the dot itself, keeping
      // clear of the map's controls and with room for its funnel.
      const inside = (r, q) => q.x >= r.x - 6 && q.x <= r.x + w + 6 && q.y >= r.y - 6 && q.y <= r.y + h + 6;
      const onScreen = q => q.x >= 0 && q.y >= 0 && q.x <= box.width && q.y <= box.height;
      const step = Math.max(1, Math.floor(pts.length / 1500));
      const samples = [];
      for (let i = 0; i < pts.length; i += step) { const q = project(pts[i]); if (onScreen(q)) samples.push(q); }
      const dots = photos.map(o => project([o.lon, o.lat])).filter(onScreen);
      const tx = opts.travel ? opts.travel.x : 0;
      const bias = opts.sides ? [20, 20, tx > 0 ? 12 : 0, tx < 0 ? 12 : 0] : [0, 0, 0, 0];  // above, below, right, left

      // Hiding the dot outweighs covering a control, which outweighs a poor funnel, and each outweighs anything the
      // track and photo dots under the spot can add up to.
      const HIDES_DOT = 1e7, COVERS_CONTROL = 1e6, POOR_FUNNEL = 1e5;
      let best = cands[0], bestScore = Infinity;
      cands.forEach(r => {
        let score = (inside(r, pt) ? HIDES_DOT : 0) + bias[r.side];
        if (!funnelFits(r)) score += POOR_FUNNEL;
        if (controls.some(c => overControl(r.x, r.y, w, h, c, clear))) score += COVERS_CONTROL;
        for (const q of samples) if (inside(r, q)) score += 1;
        for (const q of dots) if (inside(r, q)) score += 20;
        if (score < bestScore) { bestScore = score; best = r; }
      });
      el.style.left = best.x + 'px';
      el.style.top = best.y + 'px';

      // `clean`: the spot hides neither the dot nor a control, and has room for its funnel.
      const clean = !inside(best, pt) && funnelFits(best) && !controls.some(c => overControl(best.x, best.y, w, h, c, clear));
      return { dx: best.x - pt.x, dy: best.y - pt.y, clean };
    }

    // Pans the map up or down so that the dot at `lonlat` has room for `el` above or below it, clear of the map's
    // controls, whichever takes the shorter pan; when `el` is too tall for either, the pan still centres the two in
    // the room there is. Calls `done` once the pan has ended, and does nothing when the dot is already in place.
    function makeRoom(el, lonlat, gap, done) {
      const pt = project(lonlat), box = map.getContainer().getBoundingClientRect(), h = el.offsetHeight, edge = 4;
      const controls = controlBoxes();
      const top = Math.max(edge, ...controls.filter(c => c.y + c.h / 2 < box.height / 2).map(c => c.y + c.h + 6));
      const bottom = Math.min(box.height - edge, ...controls.filter(c => c.y + c.h / 2 >= box.height / 2).map(c => c.y - 6));
      const spare = (bottom - top - gap - h) / 2;
      const below = top + spare, above = bottom - spare;
      const to = Math.abs(below - pt.y) <= Math.abs(above - pt.y) ? below : above;
      if (Math.abs(to - pt.y) < 2) return;
      map.once('moveend', done);
      map.panBy([0, pt.y - to], { duration: RM ? 0 : 400 });
    }
    window.__esTrackCard = { showCard, hideCard, placeNear };
    function goTo(i) {
      const p = photos[i];
      if (expanded) { expanded = false; place(); }
      thumb.hidden = true; hoverGroup = null;
      if (p) p.el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
    }
    map.on('mousemove', 'es-photos-hit', e => {
      if (placement === 'corner' || !e.features.length) return;
      clearTimeout(hideTimer);
      showCard(clusterAt(e.features[0].properties.i));
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'es-photos-hit', () => {
      map.getCanvas().style.cursor = '';
      clearTimeout(hideTimer);
      // a card the stepper put up stays until the next step; a hover card goes when the pointer leaves
      hideTimer = setTimeout(() => { if (stepperHoldsCard()) showCard(STEPS[browseStep].group); else hideCard(); }, 300);
    });
    thumb.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    thumb.addEventListener('mouseleave', () => { if (stepperHoldsCard()) showCard(STEPS[browseStep].group); else hideCard(); });
    thumb.addEventListener('click', e => { e.stopPropagation(); if (hoverGroup) goTo(hoverGroup[0]); });
    map.on('click', 'es-photos-hit', e => {
      if (placement === 'corner' || !e.features.length) return;
      // goTo may drop the widget back to the corner; the same DOM click must not then reach the
      // widget's corner handler, which would expand it again (and fit the track in a corner-sized map)
      e.originalEvent.stopPropagation();
      goTo(clusterAt(e.features[0].properties.i)[0]);
    });
    // clicking the track itself: the leg under the pointer, framed as its leg step
    map.on('click', 'es-track-hit', e => {
      if (placement === 'corner') return;
      if (map.queryRenderedFeatures(e.point, { layers: ['es-photos-hit'] }).length) return;  // the photo handler has it
      e.originalEvent.stopPropagation();
      let bi = 0, bd = Infinity;
      for (let i = 0; i < pts.length; i++) { const q = project(pts[i]); const d = (q.x - e.point.x) ** 2 + (q.y - e.point.y) ** 2; if (d < bd) { bd = d; bi = i; } }
      const k = STEPS.findIndex(st => st.kind === 'leg' && st.leg === segOf[bi]);
      if (k >= 0) browseTo(k);
    });
    map.on('mouseenter', 'es-track-hit', () => { if (placement !== 'corner') map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'es-track-hit', () => { map.getCanvas().style.cursor = ''; });  // a photo dot under the pointer sets it back
    thumbImg.addEventListener('error', () => { thumbImg.style.display = 'none'; });
    thumbImg.addEventListener('load', () => { if (hoverGroup && !thumb.hidden) placeCard(photos[hoverGroup[0]]); });  // the card's height changes once the image arrives
  }

  // ------------------------------------------------------------ stepping through the day
  // STEPS interleaves legs and photos in order: a leg, then the photos taken on it. Photos
  // within 25 m of each other in sequence form one step. A final step is the end of the track.
  function buildSteps() {
    STEPS = [];
    SEGMENTS.forEach((s, li) => {
      STEPS.push({ kind: 'leg', leg: li });
      let group = null;
      photos.forEach((p, pi) => {
        if (p.seg !== li) return;
        if (group && hav([p.lon, p.lat], [photos[group[0]].lon, photos[group[0]].lat]) <= 25) { group.push(pi); return; }
        group = [pi];
        STEPS.push({ kind: 'photos', leg: li, group });
      });
    });
    if (SEGMENTS.length) STEPS.push({ kind: 'end', leg: SEGMENTS.length - 1 });
  }
  // The step the view is on. The whole-day view comes before the first, at -1, so the next arrow goes to leg 1.
  function stepIndexFor(v) {
    if (!v) return 0;
    if (v.kind === 'start') return -1;
    if (v.photoIdx >= 0) { const k = STEPS.findIndex(s => s.kind === 'photos' && s.group.includes(v.photoIdx)); if (k >= 0) return k; }
    const k = STEPS.findIndex(s => s.kind === 'leg' && s.leg === v.capSeg);
    return k < 0 ? 0 : k;
  }
  function stepLabel(k) {
    if (k < 0) return 'Whole day';
    const s = STEPS[k];
    if (!s) return '';
    if (s.kind === 'leg') return `Leg ${s.leg + 1}/${SEGMENTS.length}`;
    if (s.kind === 'end') return 'End';
    return `Photo ${s.group[0] + 1}/${photos.length}`;
  }
  function browseTo(k) {
    if (!mapReady || !STEPS.length || placement === 'corner') return;
    const card = window.__esTrackCard;
    if (k < 0) {
      // Back past the first step: the whole-day view.
      browseStep = null;
      card.hideCard();
      view = dayStartView();
      applyView(true);
      fitAll(placement === 'expanded' ? (isPhone() ? 30 : 70) : 40);
      return;
    }

    browseStep = Math.min(STEPS.length - 1, k);
    const s = STEPS[browseStep];
    card.hideCard();
    if (s.kind === 'leg') {
      const seg = SEGMENTS[s.leg];
      view = { kind: 'browse', photoIdx: -1, idx: seg.start, segs: [s.leg, s.leg], capSeg: s.leg, dot: seg.coords[0], frac: total ? cum[seg.start] / total : 0, m: cum[seg.start], transit: true };
      applyView(true);
      fit(boundsOf([seg.coords], [seg.coords[0]]), { padding: isPhone() ? 40 : 90, duration: RM ? 0 : 700, maxZoom: 15.5 });
    } else if (s.kind === 'end') {
      const endIdx = pts.length - 1, endPt = pts[endIdx];
      view = { kind: 'browse', photoIdx: -1, idx: endIdx, segs: [s.leg, s.leg], capSeg: s.leg, dot: endPt, frac: 1, m: total, transit: false };
      applyView(true);
      map.easeTo({ center: endPt, zoom: Math.max(map.getZoom(), 14), duration: RM ? 0 : 600 });
    } else {
      const p = photos[s.group[0]];
      view = { kind: 'browse', photoIdx: s.group[0], segs: [s.leg, s.leg], capSeg: s.leg, dot: [p.lon, p.lat], frac: p.frac, m: p.m, transit: false };
      applyView(true);
      const show = () => { if (browseStep != null && STEPS[browseStep] === s) card.showCard(s.group); };

      // A flight video's step frames the whole stretch it covers, which the photo card then sits over.
      const clip = s.group.map(i => photos[i]).find(q => q.clip);
      if (clip) fit(boundsOf([clipCoords(clip)], [[p.lon, p.lat]]), { padding: isPhone() ? 40 : 90, duration: RM ? 0 : 700, maxZoom: 15.5 });
      // A photo from the air shows what's in view from the aircraft, as the corner map does.
      else if (FLIGHT_RADIUS_M[SEGMENTS[s.leg].mode]) fit(aroundBounds([p.lon, p.lat], flightRadius(view)), { padding: 0, duration: RM ? 0 : 700, maxZoom: 14 });
      else map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 14), duration: RM ? 0 : 600 });

      // The card waits for the camera to settle. Starting the move stopped any move still under way, which fired its
      // 'moveend' at once, so only now is the wait for this one; a move without a duration has already ended.
      if (map.isMoving()) map.once('moveend', show);
      else show();
    }
  }
  const stepFrom = () => (browseStep == null ? stepIndexFor(view) : browseStep);
  document.getElementById('es-track-prev').addEventListener('click', e => { e.stopPropagation(); browseTo(stepFrom() - 1); });
  document.getElementById('es-track-next').addEventListener('click', e => { e.stopPropagation(); browseTo(stepFrom() + 1); });

  // ------------------------------------------------------------ wiring
  // in the big views, clicking the progress band jumps to the nearest step along the track
  const stepDist = s => s.kind === 'leg' ? cum[SEGMENTS[s.leg].start] : s.kind === 'end' ? total : photos[s.group[0]].m;
  function jumpToDistance(m) {
    if (placement === 'corner' || !STEPS.length || !total) return;
    let best = 0, bd = Infinity;
    STEPS.forEach((s, k) => { const d = Math.abs(stepDist(s) - m); if (d < bd) { bd = d; best = k; } });
    browseTo(best);
  }
  document.getElementById('es-track-progress').addEventListener('click', e => {
    if (placement === 'corner') return;
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    jumpToDistance(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total);
  });
  widget.addEventListener('click', e => {
    if (placement !== 'corner') return;
    if (e.target.closest('.es-track-attr-btn, .es-track-attr, .es-track-collapse, .es-track-zoom')) return;
    if (collapsed) { setCollapsed(false, true); return; }
    expanded = true; place();
  });
  document.getElementById('es-track-expand').addEventListener('click', e => { e.stopPropagation(); expanded = true; place(); });
  document.getElementById('es-track-close').addEventListener('click', e => { e.stopPropagation(); expanded = false; place(); });
  modal.addEventListener('click', e => { if (e.target === modal) { expanded = false; place(); } });
  // the arrow keys step through the day when the map is expanded, or docked and filling most of the window
  const mapDominates = () => {
    if (expanded) return true;
    if (placement !== 'docked') return false;
    const r = widget.getBoundingClientRect();
    const visible = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return visible >= innerHeight * 0.5;
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && expanded) { expanded = false; place(); }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (!mapDominates()) return;
    e.preventDefault();
    browseTo(stepFrom() + (e.key === 'ArrowLeft' ? -1 : 1));
  });
  attrBtn.addEventListener('click', e => { e.stopPropagation(); attrBtn.setAttribute('aria-expanded', String(attrBtn.getAttribute('aria-expanded') !== 'true')); });
  collapseBtn.addEventListener('click', e => { e.stopPropagation(); setCollapsed(!collapsed, true); });
  document.getElementById('es-track-zoom-in').addEventListener('click', e => { e.stopPropagation(); if (mapReady) map.zoomIn({ duration: RM ? 0 : 300 }); });
  document.getElementById('es-track-zoom-out').addEventListener('click', e => { e.stopPropagation(); if (mapReady) map.zoomOut({ duration: RM ? 0 : 300 }); });
  document.getElementById('es-track-fit').addEventListener('click', e => { e.stopPropagation(); fitAll(placement === 'expanded' ? (isPhone() ? 30 : 70) : 40); });

  // ------------------------------------------------------------ boot
  async function start(track) {
    if (!track || !Array.isArray(track.legs) || !track.legs.length) throw new Error('empty track');
    if (track.v && track.v > 1) throw new Error('unsupported track version ' + track.v);
    SEGMENTS = track.legs.map(l => Object.assign({}, l, { coords: (l.pts || []).map(p => [p[0], p[1]]), eles: (l.pts || []).map(p => p[2]) })).filter(s => s.coords.length);
    unwrapLongitudes();
    flatten();
    if (!pts.length) throw new Error('track has no points');
    distM = typeof track.dist_m === 'number' ? track.dist_m : total;
    tripDays = CFG.days > 0 ? CFG.days : typeof track.days === 'number' ? track.days : 1;
    PARKS = (Array.isArray(track.parks) ? track.parks : []).filter(p => Array.isArray(p.polys) && p.polys.length).map(unwrapPark);
    anchorPhotos(track.photos);
    photos.forEach(p => { p.lon = nearLon(p.lon, pts[p.idx][0]); });
    attachClips(track.clips);
    buildSteps();

    const ticks = document.getElementById('es-track-ticks'), seen = new Set();
    photos.forEach(p => { const k = p.frac.toFixed(3); if (seen.has(k)) return; seen.add(k); const t = document.createElement('span'); t.className = 'tick'; t.style.left = (p.frac * 100) + '%'; ticks.appendChild(t); });

    widget.hidden = false;
    const empty = slot.querySelector('.es-track-slot-empty'); if (empty) empty.remove();
    try { const v = localStorage.getItem('es-track-collapsed'); collapsed = v === null ? (isPhone() && CFG.mobileCollapsed) : v === '1'; }
    catch (e) { collapsed = isPhone() && CFG.mobileCollapsed; }
    setCollapsed(collapsed, false);

    view = computeView(currentItem()); applyView(true);
    [, REGION] = await Promise.all([loadBaseStyle(), window.esTrack.loadRegion(CFG.regionOutline)]);
    if (!window.maplibregl) { showNotice('The map library could not be loaded.'); return; }
    initMap();
    new IntersectionObserver(es => { slotVisible = es[0].isIntersecting; place(); }, { threshold: 0 }).observe(slot);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { onScroll(); positionProgressLabels(); if (mapReady) { map.resize(); lastCamKey = null; applyCamera(true); } });
    photos.forEach(p => { const img = p.el.querySelector('img'); if (img && !img.complete) img.addEventListener('load', onScroll, { once: true }); });
    onScroll();
  }

  // say why the map failed, on the page and in the console, so a bad upload is diagnosable from a reload
  const explain = err => {
    const m = err && err.message || '';
    if (/^HTTP /.test(m) && err.url === CFG.trackFallback) return `the CDN refused the cross-origin fetch of ${CFG.trackUrl} (no CORS rule for this origin), and the same-origin fallback ${CFG.trackFallback} returned ${m}`;
    if (/^HTTP /.test(m)) return `the track file returned ${m} from ${CFG.trackUrl}`;
    if (err instanceof TypeError && /fetch|network|load/i.test(m)) return `the track file could not be fetched from ${CFG.trackUrl} (network error, or the CDN is not sending CORS headers for it)`;
    if (err instanceof SyntaxError) return `the track file at ${CFG.trackUrl} is not valid JSON`;
    return m ? `${m} (${CFG.trackUrl})` : `unknown error (${CFG.trackUrl})`;
  };
  const load = url => fetch(url, { credentials: 'omit' }).then(r => { if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { url }); return r.json(); });
  load(CFG.trackUrl)
    .catch(err => {
      // the CDN only answers cross-origin fetches from the production origins; a deploy preview proxies the
      // same path through its own origin instead, so retry there when the direct fetch was refused outright
      if (!CFG.trackFallback || !(err instanceof TypeError)) throw err;
      console.info('track-map: direct fetch refused, retrying same-origin at ' + CFG.trackFallback);
      return load(CFG.trackFallback);
    })
    .then(start)
    .catch(err => {
      const why = explain(err);
      console.warn('track-map: ' + why, err);
      const empty = slot.querySelector('.es-track-slot-empty'); if (empty) empty.textContent = 'The map for this page could not be loaded: ' + why + '.';
    });
})();
