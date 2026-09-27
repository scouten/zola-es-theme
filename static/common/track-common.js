/* track-common.js — what the track maps share: the travel modes and their icons, distance formatting, the
 * one-line summary of a day's travel, and the basemap under the maps (OpenFreeMap's vector style, trimmed to the
 * detail a view wants and recoloured from the widget's --es-track-* custom properties, with optional hillshade).
 *
 * Used by track-map.js (a day's page) and section-track-map.js (a trip's section page), which add their own
 * sources and layers on top of the basemap, and by the icon preview page. Load it before any of them.
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

  // ------------------------------------------------------------ distances
  // Distances: the metric side picks the tier, and the imperial side follows it with the same
  // rounding, except that feet give way to miles above 1000 ft. Under 950 m: metres to the nearest 10,
  // and feet to the nearest 10 up to 1000 ft ("250 m / 820 ft"), else miles to one decimal
  // ("920 m / 0.6 mi"). Under 9.95 km: one decimal in both ("1.3 km / 0.8 mi"). Otherwise whole units
  // ("167 km / 104 mi").
  const tierOf = m => m < 950 ? 'm' : m < 9950 ? 'km1' : 'km';
  const feetOf = m => Math.round(m * 3.28084 / 10) * 10;
  const imperialTierOf = m => tierOf(m) === 'm' && feetOf(m) > 1000 ? 'km1' : tierOf(m);
  function fmtMetricAs(m, tier) {
    if (tier === 'm') return `${Math.round(m / 10) * 10} m`;
    if (tier === 'km1') return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m / 1000).toLocaleString('en-US')} km`;
  }

  // `tier` is from `imperialTierOf`.
  function fmtImperialAs(m, tier) {
    if (tier === 'm') return `${feetOf(m)} ft`;
    if (tier === 'km1') return `${(m / 1609.344).toFixed(1)} mi`;
    return `${Math.round(m / 1609.344).toLocaleString('en-US')} mi`;
  }
  const fmtBoth = m => `${fmtMetricAs(m, tierOf(m))} / ${fmtImperialAs(m, imperialTierOf(m))}`;

  // ------------------------------------------------------------ day summary
  // A mode covering more than this share of the distance traveled names the day alone.
  const DOMINANT_SHARE = 0.9;

  // A day's two main ways of travel by distance, from its legs ({ mode, m }): "Flying", "Driving and walking",
  // "Flying, driving, and more"; and the mode to show its icon. Modes that share a name, such as jet and prop
  // flights, count together, and a mode that covers more than DOMINANT_SHARE of the distance is named alone (a
  // long flight with a walk through the airport is just "Flying"). Null when every leg is a stop.
  function modeSummary(legs) {
    const byName = new Map();
    legs.forEach(l => {
      if (l.mode === 'stop') return;
      const md = MODES[l.mode], name = md ? md.name : 'Travelling';
      const e = byName.get(name) || { name, mode: l.mode, m: 0 };
      e.m += l.m;
      byName.set(name, e);
    });
    const ranked = [...byName.values()].sort((a, b) => b.m - a.m);
    if (!ranked.length) return null;

    // "Cable car" is a noun; every other name reads as well mid-sentence in lower case ("by taxi").
    const lower = n => n === 'Cable car' ? 'cable car' : n.charAt(0).toLowerCase() + n.slice(1);
    const [a, b] = ranked.map(e => e.name);
    const moving = ranked.reduce((sum, e) => sum + e.m, 0);
    const alone = ranked.length === 1 || ranked[0].m > DOMINANT_SHARE * moving;
    const ways = alone ? a : ranked.length === 2 ? `${a} and ${lower(b)}` : `${a}, ${lower(b)}, and more`;
    return { ways, mode: ranked[0].mode };
  }

  // ------------------------------------------------------------ basemap
  const name = (cfg, tok) => cfg.basemap || tok('basemap') || (cfg.isDark ? 'dark' : 'positron');

  // The stock style for the site's basemap, or null when it can't be fetched (the map then shows the route alone).
  async function load(cfg, tok) {
    try {
      const r = await fetch(`https://tiles.openfreemap.org/styles/${name(cfg, tok)}`);
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } catch (e) {
      return null;
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

  // A fresh style from `base` (the result of `load`, or null) at `detail` ("terrain", "minimal" or "standard"),
  // ready for the caller to add its own sources and layers.
  function buildStyle(base, { cfg, tok, detail }) {
    let style;
    if (base) {
      style = JSON.parse(JSON.stringify(base));
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
      // Keep land borders but not the maritime ones (territorial-waters limits drawn offshore).
      // The stock filters may be legacy or expression syntax, so add the clause in the matching form.
      style.layers.forEach(l => {
        if (!/boundary/.test(l.id) || l.type !== 'line') return;
        const legacy = !l.filter || !JSON.stringify(l.filter).includes('["get"');
        const clause = legacy ? ['!=', 'maritime', 1] : ['!=', ['get', 'maritime'], 1];
        l.filter = l.filter ? ['all', l.filter, clause] : clause;
      });
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
      if (cfg.glyphs) style.glyphs = cfg.glyphs;
      // place names: optional font, names as written (the basemap uppercases towns and regions), and a brighter
      // colour where the theme defines one (dark mode; in light mode the basemap's own is the better contrast)
      const labelColor = tok('label');
      style.layers.forEach(l => {
        if (l.type !== 'symbol' || !l.layout || !l.layout['text-field']) return;
        l.layout = Object.assign({}, l.layout, { 'text-transform': 'none' });
        if (cfg.labelFont && cfg.labelFont.length) l.layout['text-font'] = cfg.labelFont;
        if (labelColor) l.paint = Object.assign({}, l.paint, { 'text-color': labelColor });
      });
    } else {
      style = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': tok('map-bg') } }] };
    }
    if (cfg.hillshade) {
      style.sources.dem = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 15 };
      // below the water fill (the tiles carry bathymetry) and below roads and labels
      let at = style.layers.findIndex(l => l.type === 'fill' && /^water/.test(l.id) && !/name/.test(l.id));
      if (at < 0) at = style.layers.findIndex(l => l.type === 'symbol');
      const hs = { id: 'es-hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': cfg.isDark ? .45 : .3, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': tok('hillshade-highlight'), 'hillshade-accent-color': '#000000' } };
      style.layers.splice(at < 0 ? style.layers.length : at, 0, hs);
    }
    return style;
  }

  window.esTrack = {
    MODES, ICONS, iconSvg, tierOf, imperialTierOf, fmtMetricAs, fmtImperialAs, fmtBoth, modeSummary,
    loadBasemap: load, basemapStyle: buildStyle,
  };

  // The icon preview page reads the icons from here.
  window.esTrackIcons = { MODES, ICONS, iconSvg };
})();
