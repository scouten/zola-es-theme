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

  // ------------------------------------------------------------ modes and icons
  // Hand-drawn line icons; see docs/track-map-icons.md before adding one.
  const MODES = {
    drive: { name: 'Driving', icon: 'car' },
    taxi: { name: 'By taxi', icon: 'taxi' },
    walk: { name: 'Walking', icon: 'walk' },
    hike: { name: 'Hiking', icon: 'hike' },
    bike: { name: 'Cycling', icon: 'bike' },
    horse: { name: 'On horseback', icon: 'horse' },
    bus: { name: 'By bus', icon: 'bus' },
    train: { name: 'By train', icon: 'train' },
    tram: { name: 'By tram', icon: 'tram' },
    cable: { name: 'Cable car', icon: 'cable' },
    boat: { name: 'By boat', icon: 'boat' },
    ferry: { name: 'By ferry', icon: 'ferry' },
    kayak: { name: 'By kayak', icon: 'kayak' },
    fly: { name: 'Flying', icon: 'jet' },
    prop: { name: 'Flying', icon: 'prop' },
    helicopter: { name: 'By helicopter', icon: 'heli' },
    stop: { name: 'Stopped', icon: 'pin' },
  };
  // legs whose caption may show a duration (the only time-derived value ever shown)
  const TIMED = ['fly', 'prop', 'boat', 'ferry', 'helicopter'];
  const ICONS = {
    car: '<path d="M5 11l1.6-4.2A1.5 1.5 0 0 1 8 6h8a1.5 1.5 0 0 1 1.4.8L19 11"/><path d="M3 17v-4.5A1.5 1.5 0 0 1 4.5 11h15a1.5 1.5 0 0 1 1.5 1.5V17h-2.5M3 17h2.5M9 17h6"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/>',
    walk: '<circle cx="13" cy="4" r="1.8"/><path d="M12 7.5l-1.5 6 3.5 3 1 5"/><path d="M10.5 13.5l-3 6.5"/><path d="M12 7.5l3 2.5 2.5 1"/><path d="M12 7.5l-3.5 1.5-1 3.5"/>',
    hike: '<circle cx="12" cy="4" r="1.8"/><path d="M11 7.5l-1.5 6 3.5 3 1 5"/><path d="M9.5 13.5l-3 6.5"/><path d="M11 7.5l3 2.5 2 1"/><path d="M11 7.5l-3.5 1.5-1 3.5"/><path d="M18.5 10v11"/>',
    bike: '<circle cx="5.5" cy="16.5" r="3.3"/><circle cx="18.5" cy="16.5" r="3.3"/><path d="M5.5 16.5L10 9h4.5l4 7.5"/><path d="M10 9l3 7.5H5.5"/><path d="M13 6h2.5"/>',
    bus: '<rect x="4" y="4" width="16" height="14" rx="2.5"/><path d="M4 11h16"/><path d="M7.5 18v2.5M16.5 18v2.5"/><circle cx="8" cy="14.5" r="1.1"/><circle cx="16" cy="14.5" r="1.1"/>',
    train: '<rect x="5" y="3.5" width="14" height="13.5" rx="3"/><path d="M5 10.5h14"/><circle cx="9" cy="13.8" r="1.1"/><circle cx="15" cy="13.8" r="1.1"/><path d="M8.5 21l1.8-4M15.5 21l-1.8-4"/>',
    cable: '<path d="M2 7l20-4"/><path d="M12 5v4"/><rect x="6.5" y="9" width="11" height="10" rx="2"/><path d="M6.5 13.5h11"/><path d="M12 9v10"/>',
    jet: '<path d="M12 2.5c1 0 1.5 1.5 1.5 3v4.5l7.5 4.5v2l-7.5-2.5v3l2.5 2v1.5L12 19.5 8 21v-1.5l2.5-2v-3L3 17v-2l7.5-4.5V5.5c0-1.5.5-3 1.5-3z"/>',
    prop: '<path d="M10.5 20.5h3l.5-6h7.5v-2.5l-7.5-1.5V7.5c0-1.5-1-2.5-2-2.5s-2 1-2 2.5v3L2.5 12v2.5H10l.5 6z"/><path d="M7 3h10"/><path d="M12 3v2"/><path d="M8.5 19h7"/>',
    boat: '<path d="M3 15c1 2 2 3 4 3h9c2 0 3.5-1 5-3H3z"/><path d="M12 4v11"/><path d="M12 4l6 9H12"/><path d="M3 21c1.5 1.2 3.5 1.2 5 0 1.5 1.2 3.5 1.2 5 0 1.5 1.2 3.5 1.2 5 0"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
    route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H13a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h4.8"/>',
    taxi: '<path d="M5 11l1.6-4.2A1.5 1.5 0 0 1 8 6h8a1.5 1.5 0 0 1 1.4.8L19 11"/><path d="M3 17v-4.5A1.5 1.5 0 0 1 4.5 11h15a1.5 1.5 0 0 1 1.5 1.5V17h-2.5M3 17h2.5M9 17h6"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/><path d="M9.5 6V3.5h5V6"/>',
    ferry: '<g transform="matrix(-1 0 0 1 24 0)"><path d="M3 13.5h15.5l2.5-2 1 2-2.5 4H5.5z"/><rect x="6" y="8" width="10" height="5.5" rx="1"/><path d="M8.5 10.8h5"/><path d="M13.5 8V5.5h2"/><path d="M3 21c1.5 1.2 3.5 1.2 5 0 1.5 1.2 3.5 1.2 5 0 1.5 1.2 3.5 1.2 5 0"/></g>',
    tram: '<rect x="5" y="6" width="14" height="12" rx="3"/><path d="M5 12h14"/><circle cx="9" cy="15" r="1.1"/><circle cx="15" cy="15" r="1.1"/><path d="M12 6V3.5M9.5 3.5h5"/><path d="M4 21h16"/>',
    horse: '<g transform="rotate(-14 12 13)"><path d="M2 6.5c4-1.5 7.5-2 10-2l1-3.2 2.5 2.7c2.5 2.5 4.5 6.5 5.5 11.5.3 1.5-.5 2.5-2 2.5h-1.5c-1 0-2-.5-2.5-1.5L11 12"/><path d="M11 12c-1.5 1.5-3 4.5-4 10"/><path d="M17 8.5h.01"/><path d="M6 6.6L3.5 3.8M9 5.4L7 2.6"/></g>',
    kayak: '<path d="M2 12c4-3 16-3 20 0-4 3-16 3-20 0z"/><path d="M6.5 17.5l11-11"/><path d="M4.5 19.5l2-2M17.5 6.5l2-2"/>',
    heli: '<path d="M3 5h18"/><path d="M12 5v3"/><path d="M16 8h-5a4 4 0 0 0-4 4v1a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3z"/><path d="M7 11H3"/><path d="M5 9v4"/><path d="M7 19h10M9 16v3M15 16v3"/>',
  };
  const iconSvg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.route}</svg>`;
  // exposed for the icon preview page and for tooling; not used by the site itself
  window.esTrackIcons = { MODES, ICONS, iconSvg };

  const cfgEl = document.getElementById('es-track-config');
  const widget = document.getElementById('es-track-widget');
  if (!cfgEl || !widget) return;
  const CFG = JSON.parse(cfgEl.textContent);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tok = n => getComputedStyle(widget).getPropertyValue('--es-track-' + n).trim();
  const isPhone = () => innerWidth <= 720;

  // ------------------------------------------------------------ helpers
  const R = 6371000;
  function hav(a, b) {
    const toR = Math.PI / 180;
    const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // Distances: the metric side picks the tier, and the imperial side follows it with the same
  // rounding. Under 950 m: metres and feet, both to the nearest 10 ("920 m / 3020 ft").
  // Under 9.95 km: one decimal in both ("1.3 km / 0.8 mi"). Otherwise whole units ("167 km / 104 mi").
  const tierOf = m => m < 950 ? 'm' : m < 9950 ? 'km1' : 'km';
  function fmtMetricAs(m, tier) {
    if (tier === 'm') return `${Math.round(m / 10) * 10} m`;
    if (tier === 'km1') return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m / 1000).toLocaleString('en-US')} km`;
  }
  function fmtImperialAs(m, tier) {
    if (tier === 'm') return `${Math.round(m * 3.28084 / 10) * 10} ft`;
    if (tier === 'km1') return `${(m / 1609.344).toFixed(1)} mi`;
    return `${Math.round(m / 1609.344).toLocaleString('en-US')} mi`;
  }
  const fmtMetric = m => fmtMetricAs(m, tierOf(m));
  const fmtBoth = m => `${fmtMetricAs(m, tierOf(m))} / ${fmtImperialAs(m, tierOf(m))}`;
  // Same tier as a reference distance, so "0 km / 0 mi" sits beside "167 km / 104 mi".
  const fmtLike = (m, ref) => `${fmtMetricAs(m, tierOf(ref))} / ${fmtImperialAs(m, tierOf(ref))}`;
  function fmtDur(s) {
    const m = Math.round(s / 60), h = Math.floor(m / 60);
    return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
  }

  // ------------------------------------------------------------ page content
  const markers = (typeof window.addGpxMarkers === 'function') ? (window.addGpxMarkers(null) || []).filter(Boolean) : [];
  const photos = [];
  markers.forEach(m => {
    let el = document.getElementById(m.id);
    if (!el) return;
    el = el.closest('.es_image, .es_video') || el;
    const cap = el.querySelector('.caption');
    const loc = cap ? cap.textContent.replace(/\s+/g, ' ').replace(/\s*·\s*by\s.*$/, '').trim() : '';
    photos.push({ id: m.id, lat: m.lat, lon: m.lon, thumb: m.thumb, loc, el });
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
  const thumbImg = thumb.querySelector('img');
  const thumbLoc = document.getElementById('es-track-thumb-loc');
  const collapseBtn = document.getElementById('es-track-collapse');
  const attrBtn = document.getElementById('es-track-attr-btn');
  const showNotice = msg => { notice.textContent = msg || ''; notice.hidden = !msg; };

  // ------------------------------------------------------------ state
  let SEGMENTS = [], pts = [], cum = [], segOf = [], total = 0;
  let map = null, mapReady = false, baseStyle = null;
  let placement = 'corner', placedOnce = false, slotVisible = false, expanded = false, collapsed = false;
  let view = null, lastCamKey = null, lastGrad = '', lastPhotoIdx = '';
  let browseLeg = null;   // leg being stepped through with the arrows, or null to follow the article

  // ------------------------------------------------------------ track
  function flatten() {
    pts = []; cum = []; segOf = [];
    SEGMENTS.forEach((s, si) => {
      s.start = pts.length;
      for (const c of s.coords) {
        if (pts.length === 0) { pts.push(c); cum.push(0); segOf.push(si); continue; }
        const d = hav(pts[pts.length - 1], c);
        if (d < 0.5 && pts.length !== s.start) continue;
        pts.push(c); cum.push(cum[cum.length - 1] + d); segOf.push(si);
      }
      s.end = pts.length - 1;
    });
    total = cum[cum.length - 1] || 0;
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
  function computeView(it) {
    if (!it || !pts.length) return null;
    const i = items.indexOf(it);
    const mk = (kind, pi, segs, capSeg, dot, transit) => {
      const p = pi >= 0 ? photos[pi] : null;
      return { kind, photoIdx: pi, segs, capSeg, dot, frac: p ? p.frac : 0, m: p ? p.m : 0, transit: !!transit };
    };
    if (it.photo) { const p = it.photo, pi = photos.indexOf(p); return mk('photo', pi, [p.seg, p.seg], p.seg, [p.lon, p.lat]); }
    let prev = null, next = null;
    for (let k = i - 1; k >= 0; k--) if (items[k].photo) { prev = items[k].photo; break; }
    for (let k = i + 1; k < items.length; k++) if (items[k].photo) { next = items[k].photo; break; }
    const last = SEGMENTS.length - 1;
    if (!prev) return mk('start', -1, [0, 0], 0, pts[0]);
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

  // ------------------------------------------------------------ map data
  const lineOrEmpty = coords => coords.length > 1
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
    : { type: 'FeatureCollection', features: [] };
  const linesFC = lists => ({ type: 'FeatureCollection', features: lists.filter(c => c.length > 1).map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) });
  const doneData = v => lineOrEmpty(pts.slice(0, viewIdx(v) + 1));
  const aheadData = v => lineOrEmpty(pts.slice(viewIdx(v)));
  const currentLegData = v => v ? linesFC(segCoords(v.segs[0], v.segs[1])) : linesFC([]);
  const dotData = v => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: v ? v.dot : pts[0] } });
  function doneGradient(v) {
    const accent = tok('accent'), dim = tok('accent-dim'), e = 0.0004;
    const flat = c => ['interpolate', ['linear'], ['line-progress'], 0, c, 1, c];
    if (!v) return flat(accent);
    const doneLen = cum[viewIdx(v)], legStart = cum[SEGMENTS[v.capSeg].start];
    const f = doneLen > 0 ? Math.min(Math.max(legStart / doneLen, 0), 1) : 0;
    if (f <= e) return flat(accent);
    if (f >= 1 - e) return flat(dim);
    return ['interpolate', ['linear'], ['line-progress'], 0, dim, f - e / 2, dim, f + e / 2, accent, 1, accent];
  }
  const photoColorExpr = (curIdx, capSeg) => {
    const cur = placement !== 'corner' ? tok('current') : tok('accent');
    const seg = capSeg == null ? 0 : capSeg;
    return ['case', ['==', ['get', 'seg'], seg], cur, ['<', ['get', 'seg'], seg], tok('accent-dim'), ['<=', ['get', 'i'], curIdx], tok('accent'), tok('ahead')];
  };

  function ourSources() {
    const cur = view;
    return {
      track: { type: 'geojson', data: lineOrEmpty(pts) },
      done: { type: 'geojson', lineMetrics: true, data: doneData(cur) },
      ahead: { type: 'geojson', data: aheadData(cur) },
      current: { type: 'geojson', data: currentLegData(cur) },
      photos: { type: 'geojson', data: { type: 'FeatureCollection', features: photos.map((p, i) => ({ type: 'Feature', properties: { i, seg: p.seg, id: p.id }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) } },
      dot: { type: 'geojson', data: dotData(cur) },
    };
  }
  function ourLayers() {
    const big = placement !== 'corner';
    const accent = tok('accent');
    // In the docked and expanded views the current leg is drawn in its own colour on top of
    // the traveled/ahead lines; in the corner it keeps the amber glow only.
    const cur = big ? tok('current') : accent;
    const layers = [
      { id: 'es-track-casing', type: 'line', source: 'track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': tok('casing'), 'line-width': big ? 6 : 4.8 } },
      { id: 'es-current-halo', type: 'line', source: 'current', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': cur, 'line-width': big ? 16 : 12, 'line-opacity': .22, 'line-blur': 3 } },
      { id: 'es-track-ahead', type: 'line', source: 'ahead', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': tok('ahead'), 'line-width': big ? 3.5 : 3 } },
      { id: 'es-track-done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': big ? 3.5 : 3, 'line-gradient': doneGradient(view) } },
    ];
    if (big) layers.push({ id: 'es-current-line', type: 'line', source: 'current', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': cur, 'line-width': 3.5 } });
    if (CFG.dots) {
      layers.push({ id: 'es-photos', type: 'circle', source: 'photos', paint: { 'circle-radius': big ? 5 : 3, 'circle-color': photoColorExpr(view ? view.photoIdx : -1, view ? view.capSeg : 0), 'circle-stroke-color': tok('ground-deep'), 'circle-stroke-width': 1 } });
      layers.push({ id: 'es-photos-hit', type: 'circle', source: 'photos', paint: { 'circle-radius': big ? 12 : 6, 'circle-opacity': 0 } });
    }
    layers.push({ id: 'es-dot-halo', type: 'circle', source: 'dot', paint: { 'circle-radius': big ? 14 : 11, 'circle-color': accent, 'circle-opacity': .3, 'circle-blur': .4 } });
    layers.push({ id: 'es-dot', type: 'circle', source: 'dot', paint: { 'circle-radius': big ? 6 : 5, 'circle-color': tok('dot'), 'circle-stroke-color': accent, 'circle-stroke-width': 2.5 } });
    return layers;
  }

  // ------------------------------------------------------------ basemap
  function basemapName() { return CFG.basemap || tok('basemap') || (CFG.isDark ? 'dark' : 'positron'); }
  async function loadBaseStyle() {
    try {
      const r = await fetch(`https://tiles.openfreemap.org/styles/${basemapName()}`);
      if (!r.ok) throw new Error(String(r.status));
      baseStyle = await r.json();
    } catch (e) {
      baseStyle = null;
      showNotice('Map tiles unavailable. Showing the route alone.');
    }
  }
  function keepLayer(l, detail) {
    if (detail === 'standard') return true;
    const id = l.id;
    if (detail === 'terrain') {
      if (l.type === 'background') return true;
      if (l.type === 'symbol') return /place_(city|town)|water_name/.test(id) && !/poi|highway|road/.test(id);
      return /^(water|waterway|ocean|landcover|park)/.test(id) && !/outline|name/.test(id);
    }
    if (l.type === 'symbol') return /place_(city|town|village|country|state)|water_name/.test(id) && !/poi|highway|road|housenum|transit|airport|shield|suburb|other|neighbourhood|hamlet/.test(id);
    if (l.type === 'fill' || l.type === 'fill-extrusion') return !/building|residential|commercial|industrial|pitch|cemetery|hospital|school|stadium|aeroway|zoo|theme_park/.test(id);
    if (l.type === 'line') return !/minor|service|path|track|pier|tunnel|rail|transit|aeroway|ferry|oneway|steps|pedestrian|link|area|outline|bridge_(minor|service|path|rail)/.test(id);
    return true;
  }
  function buildStyle() {
    // full detail only when expanded to the modal; minimal elsewhere
    const detail = placement === 'expanded' ? 'standard' : (CFG.detail || 'minimal');
    let style;
    if (baseStyle) {
      style = JSON.parse(JSON.stringify(baseStyle));
      style.layers = style.layers.filter(l => keepLayer(l, detail));
      const water = tok('water'), coast = tok('coast'), road = tok('road'), roadMajor = tok('road-major');
      // Roads as single simple lines: drop the casing layers the stock style draws under them,
      // and paint what's left one grey, with major roads a little wider.
      const isRoad = l => l.type === 'line' && /highway|road|transportation|motorway|trunk|primary|secondary|tertiary|minor|street|path/.test(l.id)
        && !/casing|label|name|shield|oneway|rail|transit|ferry|aeroway|waterway|boundary/.test(l.id);
      const isMajor = l => /motorway|trunk|primary|major/.test(l.id);
      // Scale a width in place. Zoom-driven widths are ["interpolate", …, ["zoom"], stop, value, …] or
      // ["step", ["zoom"], value, stop, value, …]; ["zoom"] may only sit at the top level of such an
      // expression, so the values inside are scaled rather than wrapping the whole thing.
      function widen(w, f) {
        if (typeof w === 'number') return w * f;
        if (w && !Array.isArray(w) && Array.isArray(w.stops)) return Object.assign({}, w, { stops: w.stops.map(([z, v]) => [z, typeof v === 'number' ? v * f : v]) });
        if (!Array.isArray(w)) return w;
        if (w[0] === 'interpolate') return w.map((x, i) => (i >= 3 && i % 2 === 0 && typeof x === 'number') ? x * f : x);
        if (w[0] === 'step') return w.map((x, i) => (i >= 2 && i % 2 === 0 && typeof x === 'number') ? x * f : x);
        return w;
      }
      style.layers = style.layers.filter(l => !(l.type === 'line' && /casing/.test(l.id)));
      style.layers.forEach(l => {
        if (isRoad(l)) {
          const paint = Object.assign({}, l.paint, { 'line-color': isMajor(l) ? roadMajor : road, 'line-opacity': 1 });
          if (isMajor(l) && paint['line-width'] != null) paint['line-width'] = widen(paint['line-width'], 1.3);
          delete paint['line-dasharray'];
          l.paint = paint;
        }
        // solid water with a hairline of very dark blue along the shore
        if (l.type === 'fill' && /^water/.test(l.id) && !/name/.test(l.id)) l.paint = Object.assign({}, l.paint, { 'fill-color': water, 'fill-opacity': 1, 'fill-antialias': true, 'fill-outline-color': coast });
        if (l.type === 'line' && /waterway/.test(l.id)) l.paint = Object.assign({}, l.paint, { 'line-color': water });
      });
      if (CFG.glyphs) style.glyphs = CFG.glyphs;
      if (CFG.labelFont && CFG.labelFont.length) {
        style.layers.forEach(l => { if (l.type === 'symbol' && l.layout && l.layout['text-field']) l.layout = Object.assign({}, l.layout, { 'text-font': CFG.labelFont }); });
      }
    } else {
      style = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': tok('map-bg') } }] };
    }
    if (CFG.hillshade) {
      style.sources.dem = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 15 };
      // below the water fill (the tiles carry bathymetry) and below roads and labels
      let at = style.layers.findIndex(l => l.type === 'fill' && /^water/.test(l.id) && !/name/.test(l.id));
      if (at < 0) at = style.layers.findIndex(l => l.type === 'symbol');
      const hs = { id: 'es-hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': CFG.isDark ? .45 : .3, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': tok('hillshade-highlight'), 'hillshade-accent-color': '#000000' } };
      style.layers.splice(at < 0 ? style.layers.length : at, 0, hs);
    }
    Object.assign(style.sources, ourSources());
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
  function fitAll(pad) { if (mapReady) map.fitBounds(boundsOf([pts]), { padding: pad, duration: RM ? 0 : 900, maxZoom: 15 }); }
  function applyCamera(force) {
    if (!mapReady || !view || placement !== 'corner' || collapsed) return;
    let key, bounds;
    const pad = isPhone() ? 14 : 26;
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
    map.fitBounds(bounds, { padding: pad, duration: RM ? 0 : 1100, maxZoom: view.transit ? 15.5 : 14.5, essential: true });
  }
  function positionProgressLabels() {
    if (!view) return;
    const band = document.getElementById('es-track-progress'), cur = document.getElementById('es-track-cur'), tot = document.getElementById('es-track-tot');
    cur.textContent = fmtLike(view.m, total);
    tot.textContent = fmtBoth(total);
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
    document.getElementById('es-track-ico').innerHTML = iconSvg(md ? md.icon : 'route');
    // No clock times in public. A duration appears only on flights and boat rides, on the
    // second line between the endpoints: "ATL → 14 h 15 min → CPT".
    const showDur = TIMED.includes(seg.mode) && seg.dur_s;
    let head;
    if (seg.mode === 'stop') head = seg.label || md.name;
    else head = `${md ? md.name + ' · ' : ''}${fmtBoth(segDist(seg))}`;
    let sub = seg.mode === 'stop' ? '' : (seg.label || '');
    if (showDur) {
      const m = sub.match(/^(.*?)\s*(→|->|⟶|–)\s*(.*)$/);
      sub = m ? `${m[1]} ${m[2]} ${fmtDur(seg.dur_s)} ${m[2]} ${m[3]}` : (sub ? `${sub} · ${fmtDur(seg.dur_s)}` : fmtDur(seg.dur_s));
    }
    // Labels come from a fetched document: always text, never markup.
    const text = document.getElementById('es-track-text');
    text.replaceChildren();
    const modeEl = document.createElement('span'); modeEl.className = 'mode'; modeEl.textContent = head; text.appendChild(modeEl);
    if (sub) { const labelEl = document.createElement('span'); labelEl.className = 'label'; labelEl.textContent = sub; text.appendChild(labelEl); }
    document.getElementById('es-track-fill').style.width = (view.frac * 100).toFixed(2) + '%';
    positionProgressLabels();
    document.getElementById('es-track-step-label').textContent = `${(browseLeg == null ? view.capSeg : browseLeg) + 1} / ${SEGMENTS.length}`;
    if (!mapReady) return;
    map.getSource('dot').setData(dotData(view));
    map.getSource('current').setData(currentLegData(view));
    const gradKey = viewIdx(view) + ':' + view.capSeg;
    if (force || gradKey !== lastGrad) {
      lastGrad = gradKey;
      map.getSource('done').setData(doneData(view));
      map.getSource('ahead').setData(aheadData(view));
      map.setPaintProperty('es-track-done', 'line-gradient', doneGradient(view));
    }
    const dotKey = view.photoIdx + ':' + view.capSeg;
    if (CFG.dots && map.getLayer('es-photos') && (force || dotKey !== lastPhotoIdx)) { lastPhotoIdx = dotKey; map.setPaintProperty('es-photos', 'circle-color', photoColorExpr(view.photoIdx, view.capSeg)); }
    applyCamera(force);
  }
  let ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (browseLeg != null && placement !== 'corner') { updateOverlap(); return; }
      const v = computeView(currentItem());
      if (v && (!view || v.kind !== view.kind || v.photoIdx !== view.photoIdx || v.segs[0] !== view.segs[0] || v.segs[1] !== view.segs[1])) { view = v; applyView(false); }
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
    placement = target;
    if (browseLeg != null) { browseLeg = null; view = computeView(currentItem()) || view; }
    widget.classList.remove('is-corner', 'is-docked', 'is-expanded');
    widget.classList.add('is-' + target);
    (target === 'corner' ? document.body : target === 'docked' ? slot : modal).appendChild(widget);
    modal.hidden = target !== 'expanded';
    document.body.style.overflow = target === 'expanded' ? 'hidden' : '';
    thumb.hidden = true;
    requestAnimationFrame(positionProgressLabels);
    if (!mapReady) return;
    setInteractive(target !== 'corner');
    map.setStyle(buildStyle());
    map.once('style.load', () => {
      map.resize();
      if (target === 'corner') { lastCamKey = null; applyCamera(true); }
      else fitAll(target === 'expanded' ? (isPhone() ? 30 : 70) : 40);
    });
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
  }

  // ------------------------------------------------------------ map init
  function initMap() {
    map = new maplibregl.Map({ container: 'es-track-canvas', style: buildStyle(), attributionControl: false, fadeDuration: 0, maxZoom: 17, minZoom: 1, pitchWithRotate: false, center: pts[0], zoom: 9 });
    setInteractive(false);
    map.on('load', () => {
      mapReady = true; lastCamKey = null; lastGrad = ''; lastPhotoIdx = '';
      setInteractive(placement !== 'corner');
      applyView(true);
      if (placement !== 'corner') fitAll(placement === 'expanded' ? 70 : 40);
    });
    map.on('style.load', () => { if (mapReady) { lastCamKey = null; lastGrad = ''; lastPhotoIdx = ''; applyView(true); } });
    map.on('error', e => { const m = (e && e.error && e.error.message) || ''; if (m) console.warn('track-map:', m); });

    // Photos whose dots overlap the hovered one at the current zoom, in page order.
    function clusterAt(i) {
      const c = map.project([photos[i].lon, photos[i].lat]);
      const group = [];
      photos.forEach((p, k) => { const q = map.project([p.lon, p.lat]); if (Math.hypot(q.x - c.x, q.y - c.y) <= 12) group.push(k); });
      return group.length ? group : [i];
    }
    let hoverGroup = null, hideTimer = null;
    function goTo(i) {
      const p = photos[i];
      if (expanded) { expanded = false; place(); }
      thumb.hidden = true; hoverGroup = null;
      if (p) p.el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
    }
    map.on('mousemove', 'es-photos-hit', e => {
      if (placement === 'corner' || !e.features.length) return;
      clearTimeout(hideTimer);
      const group = clusterAt(e.features[0].properties.i), p = photos[group[0]];
      if (!p) return;
      hoverGroup = group;
      if (p.thumb) { if (thumbImg.getAttribute('src') !== p.thumb) { thumbImg.style.display = ''; thumbImg.src = p.thumb; } }
      else { thumbImg.removeAttribute('src'); thumbImg.style.display = 'none'; }
      thumbLoc.textContent = p.loc || '';
      if (group.length > 1) { const more = document.createElement('span'); more.className = 'more'; more.textContent = `+${group.length - 1} more`; thumbLoc.appendChild(more); }
      // keep the card inside the map: below the dot when there's no room above, clamped sideways
      const pt = map.project([p.lon, p.lat]);
      const box = map.getContainer().getBoundingClientRect();
      thumb.classList.toggle('is-below', pt.y < 240);
      const half = 88;
      thumb.style.left = Math.max(half, Math.min(box.width - half, pt.x)) + 'px';
      thumb.style.top = pt.y + 'px';
      thumb.hidden = false;
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'es-photos-hit', () => {
      map.getCanvas().style.cursor = '';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { thumb.hidden = true; hoverGroup = null; }, 300);
    });
    thumb.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    thumb.addEventListener('mouseleave', () => { thumb.hidden = true; hoverGroup = null; });
    thumb.addEventListener('click', e => { e.stopPropagation(); if (hoverGroup) goTo(hoverGroup[0]); });
    map.on('click', 'es-photos-hit', e => {
      if (placement === 'corner' || !e.features.length) return;
      goTo(clusterAt(e.features[0].properties.i)[0]);
    });
    thumbImg.addEventListener('error', () => { thumbImg.style.display = 'none'; });
  }

  // ------------------------------------------------------------ stepping through legs
  function browseTo(i) {
    if (!mapReady || !SEGMENTS.length || placement === 'corner') return;
    browseLeg = Math.max(0, Math.min(SEGMENTS.length - 1, i));
    const s = SEGMENTS[browseLeg];
    view = { kind: 'browse', photoIdx: -1, idx: s.start, segs: [browseLeg, browseLeg], capSeg: browseLeg, dot: s.coords[0], frac: total ? cum[s.start] / total : 0, m: cum[s.start], transit: true };
    applyView(true);
    map.fitBounds(boundsOf([s.coords], [s.coords[0]]), { padding: isPhone() ? 40 : 90, duration: RM ? 0 : 700, maxZoom: 15.5 });
  }
  const stepFrom = () => (browseLeg == null ? (view ? view.capSeg : 0) : browseLeg);
  document.getElementById('es-track-prev').addEventListener('click', e => { e.stopPropagation(); browseTo(stepFrom() - 1); });
  document.getElementById('es-track-next').addEventListener('click', e => { e.stopPropagation(); browseTo(stepFrom() + 1); });

  // ------------------------------------------------------------ wiring
  widget.addEventListener('click', e => {
    if (placement !== 'corner') return;
    if (e.target.closest('.es-track-attr-btn, .es-track-attr, .es-track-collapse, .es-track-zoom')) return;
    if (collapsed) { setCollapsed(false, true); return; }
    expanded = true; place();
  });
  document.getElementById('es-track-expand').addEventListener('click', e => { e.stopPropagation(); expanded = true; place(); });
  document.getElementById('es-track-close').addEventListener('click', e => { e.stopPropagation(); expanded = false; place(); });
  modal.addEventListener('click', e => { if (e.target === modal) { expanded = false; place(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && expanded) { expanded = false; place(); }
    if (expanded && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); browseTo(stepFrom() + (e.key === 'ArrowLeft' ? -1 : 1)); }
  });
  attrBtn.addEventListener('click', e => { e.stopPropagation(); attrBtn.setAttribute('aria-expanded', String(attrBtn.getAttribute('aria-expanded') !== 'true')); });
  collapseBtn.addEventListener('click', e => { e.stopPropagation(); setCollapsed(!collapsed, true); });
  document.getElementById('es-track-zoom-in').addEventListener('click', e => { e.stopPropagation(); if (mapReady) map.zoomIn({ duration: RM ? 0 : 300 }); });
  document.getElementById('es-track-zoom-out').addEventListener('click', e => { e.stopPropagation(); if (mapReady) map.zoomOut({ duration: RM ? 0 : 300 }); });

  // ------------------------------------------------------------ boot
  async function start(track) {
    if (!track || !Array.isArray(track.legs) || !track.legs.length) throw new Error('empty track');
    if (track.v && track.v > 1) throw new Error('unsupported track version ' + track.v);
    SEGMENTS = track.legs.map(l => Object.assign({}, l, { coords: (l.pts || []).map(p => [p[0], p[1]]) })).filter(s => s.coords.length);
    flatten();
    if (!pts.length) throw new Error('track has no points');
    anchorPhotos(track.photos);

    const ticks = document.getElementById('es-track-ticks'), seen = new Set();
    photos.forEach(p => { const k = p.frac.toFixed(3); if (seen.has(k)) return; seen.add(k); const t = document.createElement('span'); t.className = 'tick'; t.style.left = (p.frac * 100) + '%'; ticks.appendChild(t); });

    widget.hidden = false;
    const empty = slot.querySelector('.es-track-slot-empty'); if (empty) empty.remove();
    try { const v = localStorage.getItem('es-track-collapsed'); collapsed = v === null ? (isPhone() && CFG.mobileCollapsed) : v === '1'; }
    catch (e) { collapsed = isPhone() && CFG.mobileCollapsed; }
    setCollapsed(collapsed, false);

    view = computeView(currentItem()); applyView(true);
    await loadBaseStyle();
    if (!window.maplibregl) { showNotice('The map library could not be loaded.'); return; }
    initMap();
    new IntersectionObserver(es => { slotVisible = es[0].isIntersecting; place(); }, { threshold: 0 }).observe(slot);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { onScroll(); positionProgressLabels(); if (mapReady) { map.resize(); lastCamKey = null; applyCamera(true); } });
    photos.forEach(p => { const img = p.el.querySelector('img'); if (img && !img.complete) img.addEventListener('load', onScroll, { once: true }); });
    onScroll();
  }

  fetch(CFG.trackUrl, { credentials: 'omit' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(start)
    .catch(err => {
      console.warn('track-map: ' + err.message);
      const empty = slot.querySelector('.es-track-slot-empty'); if (empty) empty.textContent = 'The map for this page could not be loaded.';
    });
})();
