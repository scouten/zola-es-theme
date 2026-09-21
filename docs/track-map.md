# Track map

A corner map that follows the reader through a day's photos, replacing the Google Maps / KML map on pages that opt in. The old map (`templates/map.html`) is untouched and keeps serving every page that hasn't.

Built on [MapLibre GL JS](https://maplibre.org/) with [OpenFreeMap](https://openfreemap.org/) vector tiles and AWS/Mapzen terrain tiles for hillshade. No API keys.

## Enabling it on a site

Add a table to the site's `config.toml`. Its presence turns the feature on; every key is optional.

```toml
[extra.track_map]
basemap = ""             # "dark" | "positron" | any OpenFreeMap style; default follows extra.is_dark
detail = "minimal"       # "terrain" | "minimal" | "standard" in the corner and docked views (expanded is always standard)
hillshade = true
photo_dots = true        # a dot on the map for every photo
dim_over_photos = true   # fade the corner widget while it overlaps a photo
mobile_collapsed = true  # phones start with just the status line
corner = "left"          # or "right"
glyphs = ""              # optional glyph URL template for map labels, see Fonts
label_font = []          # optional font stack for map labels, e.g. ["Expo Sans Pro Regular"]
```

Sites without this table (146parks.blog, ericscouten.dev) see no change at all.

## Migrating a page

Add one key to the page's front matter. Nothing else changes; `markers.js` is reused as is.

```toml
[extra]
track_key = "track/v2/2026/03/2026-03-05.json"   # on the CDN (img.ericscouten.com), like cover_cdn_key
# or, for local testing:
# track_url = "/track/v2/2026/03/2026-03-05.json"
```

`track_log_key` can stay during the transition; it's ignored once `track_key` is present. Remove the key to revert the page to the old map.

The `distance` and `route` keys still feed the caption under the docked map and the "(map)" link in the title.

## The track JSON

Produced by the CDN toolchain from a GPX that Waysmith has cut into legs. The full format, including the privacy rule (no clock times anywhere) and the photo-anchor scheme, is specified in `docs/track-format.md`. In short:

```json
{ "v": 1, "dist_m": 166100, "bbox": [minLon, minLat, maxLon, maxLat],
  "legs": [ { "mode": "drive", "label": "Cape Town → Muizenberg", "dist_m": 35700, "ele": [5, 140],
              "pts": [[lon, lat, ele], …] },
            { "mode": "stop", "label": "Muizenberg", "dist_m": 0, "pts": [[lon, lat]] } ],
  "photos": [ { "id": "lr-263-7376", "leg": 1, "i": 0, "f": 0.2138 } ] }
```

Modes: `drive`, `taxi`, `walk`, `hike`, `bike`, `horse`, `bus`, `train`, `tram`, `cable`, `boat`, `ferry`, `kayak`, `fly` (jet), `prop` (light aircraft), `helicopter`, `stop`. A leg without a mode shows its distance only. A file with `photos` absent still works: photos snap to the nearest track point in page order.

## What the reader sees

- **Corner widget** (lower left, 380 px): the day's route with the traveled part in amber, finished legs in a darker amber, the current leg under a soft glow, and a dot at the photo in view. Under it, a progress bar carrying the distance so far at the colour transition and the day's total at the right, then a caption: mode icon, "Walking · 1.3 km / 0.8 mi", and the leg's name. A chevron collapses the widget to the caption alone.
- **Prose between photo groups** frames the leg that connects them and draws it dashed.
- **Docked**: when the reader reaches the map slot at the end of the article (the `#map` anchor the title links to), the widget moves into it at full width and becomes interactive, with photo thumbnails on hover.
- **Expanded**: tapping the corner map opens it full-screen with the full OpenFreeMap detail.
- **Stepping through the day**: in the docked and expanded views, arrow buttons in the status bar (and the keyboard arrows when expanded) walk through the day as a sequence of legs and photos: each leg, then the photos taken on it. A leg step frames the leg; a photo step centres on the photo and shows its card, with photos taken within 25 m of each other collapsed into one step. The last step is the end of the track, centred on its final point with the progress bar full; its label reads "End". Otherwise the label reads "Leg 9/16" or "Photo 12/35". Scrolling the article or changing views returns the map to following the reader.
- **Phones**: a bottom strip, collapsed to the status line by default.

Durations appear only on `fly`, `prop`, `helicopter`, `boat`, and `ferry` legs, on the caption's second line between the leg's endpoints when its name has an arrow ("ATL → 14 h 15 min → CPT"). No clock times are shown or shipped.

## Fonts

All HTML parts use the theme's `$header-font-family` (Expo Sans on the sites that load it).

Map labels are different: MapLibre draws them from pre-rasterised glyph files (`{fontstack}/{range}.pbf`), not from web fonts, so they use the fonts OpenFreeMap serves (Noto Sans). Expo Sans is not used for map labels: the sites' licence for it does not include web distribution of the font files, which generating glyphs would require. The `glyphs` and `label_font` keys remain for a font that is licensed for it: generate ranges with a tool such as [font-maker](https://maplibre.org/font-maker/), host them, and point `glyphs` at them.

## Files

| File | Role |
|---|---|
| `templates/track_map.html` | Markup, config JSON, marker shims, script and stylesheet tags |
| `templates/page.html` | Chooses `track_map.html` or `map.html` (`map` block) |
| `sass/_track_map.scss` | Styles; colours as custom properties the script reads |
| `static/common/track-map.js` | Behaviour |
| `docs/track-map-icons.md` | Icon style guide |
| `docs/track-format.md` | The GPX leg convention and the track JSON format |
| `tools/gpx2track.py` | Reference converter from GPX to track JSON; the CDN toolchain's behaviour is specified by it |

## Known follow-ups

- The basemap is trimmed at load time by filtering OpenFreeMap's style by layer id. A checked-in style JSON would be deterministic; capture one once the exact layer ids are confirmed.
- MapLibre is loaded from jsDelivr at the `@5` major. Pin an exact version once the integration settles.
