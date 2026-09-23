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

`track_log_key` is ignored once `track_key` is present. `nf update-blog-for-track-map` removes it, so a search for `track_log_key` finds the pages still to migrate. To revert a page to the old map, remove `track_key` and restore `track_log_key`.

The browser fetches the JSON itself, cross-origin, so the CDN must serve it with an `Access-Control-Allow-Origin` header for the site's origin. Images and the old KML never needed this: images are not fetched with `fetch()`, and Google fetched the KML server-side. A missing CORS header shows up as "could not be fetched" on the page and a CORS error in the browser console, while the same URL opens fine in a new tab.

**Deploy previews.** If the CDN's CORS rule lists exact origins (Tigris does not match wildcard subdomains), previews on `*.netlify.app` are refused. The page then retries the same key on its own origin, `/track/…`, so a preview build can proxy that path to the CDN with a Netlify rewrite. On ericscouten.travel this is done in the deploy-preview build command in `netlify.toml`, which appends `/track/* https://img.ericscouten.com/track/:splat 200` to `public/_redirects`. Production never proxies: the direct fetch succeeds and the fallback is not used. A page that uses `track_url` has no fallback.

**Local preview.** `zola serve` can't proxy, so on a local preview a refused fetch falls through to a same-origin 404, and the page reports that the CDN refused the cross-origin fetch. To see the map locally, add the preview's exact origin to the CDN's CORS rule. Include the port: the browser sends `http://127.0.0.1:1111`, and a bare `http://127.0.0.1` does not match it. Put it in the same rule as the production origins. On Tigris, an origin in a second rule was allowed on the preflight but not on the plain `GET` that the map sends. The CDN doesn't send `Vary: Origin`, so do a hard reload after changing the rule. To check the rule from a terminal:

```
curl -s -D - -o /dev/null -H "Origin: http://127.0.0.1:1111" https://img.ericscouten.com/<track_key> | grep -i allow-origin
```

The `distance` and `route` keys still feed the caption under the docked map and the "(map)" link in the title. The map shows the day's total from the track JSON's `dist_m`, so `distance` should read exactly as the map formats that number. `nf blog` and `nf update-blog-for-track-map` both write it that way.

**Highlighting a park.** List the park's OpenStreetMap relation (or way) in the page's front matter, then run `nf update-blog-for-track-map`, which fetches the boundary into the track JSON:

```toml
[extra]
parks = ["relation/5291525"]  # Guillemot Cove Nature Reserve
```

To find the reference:

1. Run `nf update-blog-for-track-map` (or add `-n` for a dry run). It lists the named parks and protected areas along the track, each with the value to paste, and marks the ones already listed with `*`.
2. If the park isn't listed, open [openstreetmap.org](https://www.openstreetmap.org), right-click inside the park, and choose **Query features**. Under **Enclosing features**, pick the park (a nature reserve, park, or protected area) and copy the `relation/…` or `way/…` from its page's URL. A pasted URL works too.

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
- **Progress bar and track**: in the docked and expanded views, clicking the bar jumps to the nearest step along the track (a photo group, a leg's start, or the end); clicking the track line on the map frames the leg under the pointer. A photo dot under the pointer wins over the line.
- **Whole track**: in the docked and expanded views, a frame button above the zoom buttons fits the map to the whole day's track.
- **Direction arrow**: a small green chevron just ahead of the position dot points the way the traveller went next. None at the end of the track.
- **Badge at the position dot**: in the docked and expanded views, a small badge beside the dot, tied to it by a short funnel (the photo card gets the same funnel), repeats the caption's icon, mode, distance and label. It sits to the side the traveller came from when the track allows, and hides while a photo card is up. On a leg step for a leg with no photos of its own (other than the first leg of the day), the badge labels the leg from its midpoint instead of the dot at its start.
- **Stepping through the day**: in the docked and expanded views, arrow buttons in the status bar (and the keyboard arrows when the map is expanded, or docked and filling at least half the window) walk through the day as a sequence of legs and photos: each leg, then the photos taken on it. A leg step frames the leg; a photo step centres on the photo and shows its card, with photos taken within 25 m of each other collapsed into one step. The last step is the end of the track, centred on its final point with the progress bar full; its label reads "End". Otherwise the label reads "Leg 9/16" or "Photo 12/35". Scrolling the article or changing views returns the map to following the reader.
- **Flight videos**: once the reader plays a video from a flight leg that has a clip (`docs/track-format.md` §2.6), the dot, traveled portion, and progress bar follow the video, and the caption shows what the aircraft is doing, its speed, and its altitude ("Flying · 198 km/h / 123 mph" over "Altitude 610 m / 2,000 ft", or "Taxiing", "Taking off", or "Landing"). Pausing holds the map where the video is; scrolling to another item returns it to following the article.
- **Parks**: a page can highlight parks, with a subtle greyed-sand tint under the track and no outline, so nothing competes with the track lines, and zooming to the whole day takes them in. See *Highlighting a park* below.
- **Phones**: a bottom strip, collapsed to the status line by default.

Durations appear only on `fly`, `prop`, `helicopter`, `boat`, and `ferry` legs, on the caption's second line between the leg's endpoints when its name has an arrow ("ATL → 14h 15min → CPT", units against the numbers, unlike distances). No clock times are shown or shipped.

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
