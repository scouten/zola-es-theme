/* kml-track.js — draws a page's KML track log on the legacy Google map (templates/map.html).
 *
 * Google removed KmlLayer from the Maps JavaScript API in version 3.66 (the `weekly` channel the map loads), so
 * the track is fetched here instead, cross-origin from the CDN, which allows the sites' origins, and each
 * LineString in it is drawn as a polyline in the KML's own line colour and width. The viewport is left alone, as
 * the layer's `preserveViewport` left it: the page's `bounds` set it. A track that can't be fetched or read is
 * reported in the console and the map goes on without it; the photo markers are placed before this is called.
 */
function addKmlTrack(map, url) {
  const DEFAULT = { color: '#0000ff', opacity: 1, width: 6 };

  // A KML colour is aabbggrr in hex; a width is in pixels.
  function lineStyle(el) {
    const c = (el.querySelector('color') || {}).textContent, w = parseFloat((el.querySelector('width') || {}).textContent);
    const hex = c ? c.trim().toLowerCase() : '';
    const ok = /^[0-9a-f]{8}$/.test(hex);
    return {
      color: ok ? '#' + hex.slice(6, 8) + hex.slice(4, 6) + hex.slice(2, 4) : DEFAULT.color,
      opacity: ok ? parseInt(hex.slice(0, 2), 16) / 255 : DEFAULT.opacity,
      width: w > 0 ? w : DEFAULT.width,
    };
  }

  fetch(url, { credentials: 'omit' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(text => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('not valid KML');

      // Shared styles by their `#id`, as placemarks refer to them.
      const styles = {};
      doc.querySelectorAll('Document > Style, kml > Style').forEach(s => {
        const ls = s.querySelector('LineStyle');
        if (ls) styles['#' + s.getAttribute('id')] = lineStyle(ls);
      });

      let drawn = 0;
      doc.querySelectorAll('Placemark').forEach(pm => {
        const inline = pm.querySelector('Style > LineStyle'), ref = pm.querySelector('styleUrl');
        const style = (inline && lineStyle(inline)) || (ref && styles[ref.textContent.trim()]) || DEFAULT;
        pm.querySelectorAll('LineString > coordinates').forEach(c => {
          const path = c.textContent.trim().split(/\s+/)
            .map(t => t.split(','))
            .map(p => ({ lat: parseFloat(p[1]), lng: parseFloat(p[0]) }))
            .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
          if (path.length < 2) return;
          new google.maps.Polyline({ path, map, clickable: false, strokeColor: style.color, strokeOpacity: style.opacity, strokeWeight: style.width });
          drawn++;
        });
      });
      if (!drawn) console.warn('map: no track lines found in ' + url);
    })
    .catch(err => console.warn('map: the track log could not be drawn from ' + url, err));
}
