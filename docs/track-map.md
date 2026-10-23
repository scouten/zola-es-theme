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
start_span_km = 0        # when set, the corner map opens on the day's region, at least this many km across, until the reader scrolls
region_outline = ""      # URL of GeoJSON polygons (e.g. a state) that the maps set apart: its surroundings dim, its border traced
nearby_places = ""       # URL of a JSON list of the site's other places, drawn faintly on the maps, see Nearby places
hide_state_names = false    # drop the state and province names from the basemap
glyphs = ""              # optional glyph URL template for map labels, see Fonts
label_font = []          # optional font stack for map labels, e.g. ["Expo Sans Pro Regular"]
```

Sites without this table (146parks.blog, ericscouten.dev) see no change at all.

## Nearby places

With `nearby_places` set to the URL of a JSON list, `[{ "name": "...", "lat": 0, "lon": 0, "url": "...", "note": "...", "cover": "..." }]` (`url`, `note` and `cover`, a photo URL shown in the label, optional), the maps draw those places as small, faint dots under the track, in the corner and expanded. They are drawn in the current-leg green, translucent, so they stay quiet beside the day's own marks until the pointer finds one (expanded only): it lights up and is named, and a click opens its `url`. On touch screens a tap names it and a tap on the name opens it. The place whose `url` is the page's own permalink is left out, and a phone's corner map doesn't draw them. The parks a page visited (see *Parks visited* under *Migrating a page*) share the tip and the hit area, but are drawn more strongly and in every view.

## Migrating a page

Add one key to the page's front matter. Nothing else changes; `markers.js` is reused as is.

```toml
[extra]
track_key = "track/v2/2026/03/2026-03-05.json"   # on the CDN (img.ericscouten.com), like cover_cdn_key
# or, for local testing:
# track_url = "/track/v2/2026/03/2026-03-05.json"
```

**Parks visited.** A page's `addParkMarker(map, seq, name, slug, lat, lon, cover)` entries, which the old map showed as dark markers linking to [146 Parks](https://146parks.blog), become marks on the track map: a dot in the park colour over the track, named beside it in the docked and expanded views, that lights up under the pointer and shows the park's cover and number; a click (on a touch screen, a tap on the tip) opens the park's page. The cover is read from the CDN under the month the park was visited, taken to be the month of the page's own `cover_cdn_key`. When the park was visited in a later month of a longer trip, give its key as an eighth argument, `addParkMarker(map, 132, "Squilchuck", "squilchuck", 47.310, -120.372, "es-4677-046", "img/v1/2024/07/es-4677-046")`; the old map ignores it. A cover that isn't there leaves the tip with the name alone.

`track_log_key` is ignored once `track_key` is present. `nf update-blog-for-track-map` removes it, so a search for `track_log_key` finds the pages still to migrate. To revert a page to the old map, remove `track_key` and restore `track_log_key`.

The browser fetches the JSON itself, cross-origin, so the CDN must serve it with an `Access-Control-Allow-Origin` header for the site's origin. Images and the old KML never needed this: images are not fetched with `fetch()`, and Google fetched the KML server-side. A missing CORS header shows up as "could not be fetched" on the page and a CORS error in the browser console, while the same URL opens fine in a new tab.

**Deploy previews.** If the CDN's CORS rule lists exact origins (Tigris does not match wildcard subdomains), previews on `*.netlify.app` are refused. The page then retries the same key on its own origin, `/track/…`, so a preview build can proxy that path to the CDN with a Netlify rewrite. On ericscouten.travel this is done in the deploy-preview build command in `netlify.toml`, which appends `/track/* https://img.ericscouten.com/track/:splat 200` to `public/_redirects`. Production never proxies: the direct fetch succeeds and the fallback is not used. A page that uses `track_url` has no fallback.

The legacy Google map's KML track (`track_log_key`, under `/kml/…` on the CDN) is fetched by the browser the same way since the Maps API dropped `KmlLayer` (`static/common/kml-track.js`), with the same same-origin fallback, so a site's preview rewrite must cover `/kml/*` too: `/kml/* https://img.ericscouten.com/kml/:splat 200`.

**Local preview.** `zola serve` can't proxy, so on a local preview a refused fetch falls through to a same-origin 404, and the page reports that the CDN refused the cross-origin fetch. To see the map locally, add the preview's exact origin to the CDN's CORS rule. Include the port: the browser sends `http://127.0.0.1:1111`, and a bare `http://127.0.0.1` does not match it. Put it in the same rule as the production origins. On Tigris, an origin in a second rule was allowed on the preflight but not on the plain `GET` that the map sends. The CDN doesn't send `Vary: Origin`, so do a hard reload after changing the rule. To check the rule from a terminal:

```
curl -s -D - -o /dev/null -H "Origin: http://127.0.0.1:1111" https://img.ericscouten.com/<track_key> | grep -i allow-origin
```

The `distance` and `route` keys still feed the caption under the docked map and the "(map)" link in the title. The map shows the day's total from the track JSON's `dist_m`, so `distance` should read exactly as the map formats that number. `nf blog` and `nf update-blog-for-track-map` both write it that way.

**Counting days.** The map calls the ends of the track "Start of day" and "End of day", or "Start of trip" and "End of trip" when the track JSON's `days` says the log covers more than one calendar day. A page can override that count, for instance when a leg from the evening before is told as the end of this day:

```toml
[extra]
days = 1
```

**Highlighting a park.** List the park's OpenStreetMap relation (or way) in the page's front matter, then run `nf update-blog-for-track-map`, which fetches the boundary into the track JSON:

```toml
[extra]
parks = ["relation/5291525"]  # Guillemot Cove Nature Reserve
```

To find the reference:

1. Run `nf update-blog-for-track-map` (or add `-n` for a dry run; `nf blog` asks the same when creating a post). At "Look for parks to highlight?", type part of the park's name, such as `Inverdoorn` or `Russian`. That searches OpenStreetMap's place names within the track's area, which is quick even for a long track. Or answer `y` to search along the whole track, which can be slow. It lists the parks found, each with the value to paste, and marks the ones already listed with `*`.
2. If the park isn't listed, open [openstreetmap.org](https://www.openstreetmap.org), right-click inside the park, and choose **Query features**. Under **Enclosing features**, pick the park (a nature reserve, park, or protected area) and copy the `relation/…` or `way/…` from its page's URL. A pasted URL works too.

## Travel after the story

A page can carry a second log for travel that belongs with it but not in its story, such as the flight home the next day. Run `nf update-blog-for-track-map <gpx> --aside <next-day-gpx> --page <folder>`. The page's map draws those legs dotted, after the day's own, and their caption reads "Afterwards" under the leg's usual lines. The map opens on the day's own legs and frames only them, in every view, until the reader clicks or steps onto an aside leg ("Leg 2/2"), which then comes into view; the whole-day button returns to the day. The day's distance, progress bar, and `distance` front matter stay the day's own. See `docs/track-format.md` §2.8. The section, year, and home maps draw aside legs dotted in their day's colour, but never frame them.

## Pages with photos and no track log

A page with a `markers.js` but no log can still use the corner map. `nf update-blog-for-track-map --photos-only --page <folder>` reads the page's photo markers, groups consecutive photos that share a caption and lie within 250 m into places, and publishes a track JSON of `stop` legs, one per place, with `dist_m` 0 and each photo anchored to its place. A caption's trailing state or country (", New Jersey") is dropped from the place's name. It sets `track_key` and leaves `distance` alone. The track is named `<date>+<folder name>`, since there is no log to name it for.

The map then shows the places and the photo dots, and steps through the photos, but draws no route. Because the track has only stops and no distance, the widget (class `is-stationary`) drops the progress bar, calls the whole-page view "4 places" (or the page's `route`), and labels steps "Place 2/4".

Such a page can still carry travel after its story: `--photos-only --aside <next-day-gpx>` appends the aside legs to the track of places. The day stays stationary, with its places counted and labelled as above, and the aside's legs are drawn dotted and labelled "Leg 3/3".

## Trip section pages

A site can list the pages of a deep section (a trip, on ericscouten.travel) oldest first, instead of the newest-first order that `section_reverse_default` gives the rest of the site:

```toml
[extra]
section_chronological_depth = 2   # sections at least this many levels deep (2026/02-22+south-africa) list oldest first
```

A section's own `reverse = true` (newest first) or `recent = true` still wins. Year pages and the home page keep their order, but list each trip as a single card instead of its days: the trip's title, the dates of its first and last days, its cover (else its first day's), and its own text (else its first day's summary). The card sits where the trip's latest day would. Those sections no longer list the trips as subsections above the cards.

When the site also has `[extra.track_map]`, such a section gets a corner map of the whole trip, as long as at least one of its pages has a `track_key` or `track_url`. The map frames the day whose card crosses the reading line (40% down the window) and colours the days as the page's map colours legs: the day before it traveled (amber), earlier days finished (a darker amber), that day current (green, with a soft glow), later days ahead (a darker grey, drawn beneath the others so they don't hide an earlier day on a shared road). Before the first card reaches that line, it shows the whole trip in amber, with the number of travel stories and the total distance. The caption has three lines: the day's title (cut to one line), its route, and its main ways of travel with its distance, as the page's own map sums up the day before its first photo. Clicking the map opens that day's page at its map. The corner map is not interactive and has no docked or expanded views. It shares the page map's collapsed state, `corner`, basemap, and `dim_over_photos` settings, fading over the cards' cover photos.

Year pages and the home page get the same corner map, following the card in view, but show only that card's track: every day's, for a trip's card. It has no whole-listing view; it fades away before the first card and over a card without a track. A card's tracks load as it comes within a window's height of view. A trip's caption gives its number of travel stories (pages) in place of a route, and clicking the map opens the trip's section page.

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

- **A region**: with `region_outline` set (146parks.blog uses its outline of Washington), every map dims what lies outside it and traces its border. The outline may be any GeoJSON of polygons (a feature collection of a mainland and its islands, say), holes included with a fine line, so the region stands out. The outline is a static GeoJSON file the site serves, so it costs no extra service at runtime.
- **Opening on the region**: with `start_span_km` set (146parks.blog uses 200, about a third of Washington), the corner map first shows the day's surroundings at least that far across, to set the scene. The reader's first scroll closes in on the whole day.
- **Corner widget** (lower left, 380 px): the day's route with the traveled part in amber, finished legs in a darker amber, the current leg under a soft glow, and a dot at the photo in view. Under it, a progress bar carrying the distance so far at the colour transition and the day's total at the right, then a caption: mode icon, "Walking · 1.3 km / 0.8 mi", and the leg's name. A chevron collapses the widget to the caption alone.
- **Prose between photo groups** frames the leg that connects them and draws it dashed.
- **Docked**: when the reader reaches the map slot at the end of the article (the `#map` anchor the title links to), the widget moves into it at full width and becomes interactive, with photo thumbnails on hover.
- **Expanded**: tapping the corner map opens it full-screen with the full OpenFreeMap detail.
- **Progress bar and track**: in the docked and expanded views, clicking the bar jumps to the nearest step along the track (a photo group, a leg's start, or the end); clicking the track line on the map frames the leg under the pointer. A photo dot under the pointer wins over the line.
- **Whole track**: in the docked and expanded views, a frame button above the zoom buttons fits the map to the whole day's track.
- **Direction arrow**: a small green chevron just ahead of the position dot points the way the traveller went next. None at the end of the track.
- **Badge at the position dot**: in the docked and expanded views, a small badge beside the dot, tied to it by a short funnel (the photo card gets the same funnel), repeats the caption's icon, mode, distance and label. It sits to the side the traveller came from when the track allows, and hides while a photo card is up. On a leg step for a leg with no photos of its own (other than the first leg of the day), the badge labels the leg from its midpoint instead of the dot at its start.
- **Stepping through the day**: in the docked and expanded views, arrow buttons in the status bar (and the keyboard arrows when the map is expanded, or docked and filling at least half the window) walk through the day as a sequence of legs, photos, and parks: each leg, then the photos taken on it, with each park visited on it (see *Parks visited*) in its place along the track among them: a park the day drove to comes at the end of the leg that reached it, before the leg that left. A leg step frames the leg; a photo step centres on the photo and shows its card, with photos taken within 25 m of each other collapsed into one step; a park step centres on the park, lights its mark, and holds its tip up, which can be clicked to open the park's page. The last step is the end of the track, centred on its final point with the progress bar full; its label reads "End". Otherwise the label reads "Leg 9/16", "Photo 12/35", or "Park 2/3". Scrolling the article or changing views returns the map to following the reader.
- **Flight videos**: once the reader plays a video from a flight leg that has a clip (`docs/track-format.md` §2.6), the dot, traveled portion, and progress bar follow the video, and the caption shows what the aircraft is doing, its speed, and its altitude ("Flying · 198 km/h / 123 mph" over "Altitude 610 m / 2,000 ft", or "Taxiing", "Taking off", or "Landing"). Pausing holds the map where the video is; scrolling to another item returns it to following the article.
- **Parks**: a page can highlight parks, with a subtle sand tint and a fine dotted outline under the track, so nothing competes with the track lines, and zooming to the whole day takes them in. Each park's name is set inside it, like a town's, at the widest clear spot of its largest polygon that keeps away from the track and the photos, so the name never sits on anything the day has to show; it fades in once the map is zoomed in far enough for it to fit there, and gives way to a town's name where the two would collide. See *Highlighting a park* under *Migrating a page*, above.
- **Parks visited**: the parks a page's `markers.js` links to on 146parks.blog are marked over the track with a dot in the park colour, a little larger than a photo dot, and named beside it in the docked and expanded views. Pointing at one shows its cover and number, and a click opens its page. Each is also a step when stepping through the day. See *Parks visited* under *Migrating a page*, above.
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
| `templates/section_track_map.html` | The trip section's corner map: markup and config JSON |
| `templates/section.html` | Page order, the cards' track data attributes, and the section map include |
| `sass/_track_map.scss` | Styles; colours as custom properties the script reads |
| `static/common/track-map.js` | Behaviour |
| `static/common/section-track-map.js` | The trip section map's behaviour |
| `static/common/track-common.js` | Shared by both maps: modes and icons, distance formatting, the day summary, and the basemap style |
| `docs/track-map-icons.md` | Icon style guide |
| `docs/track-format.md` | The GPX leg convention and the track JSON format |
| `tools/gpx2track.py` | Reference converter from GPX to track JSON; the CDN toolchain's behaviour is specified by it |

## Known follow-ups

- The basemap is trimmed at load time by filtering OpenFreeMap's style by layer id. A checked-in style JSON would be deterministic; capture one once the exact layer ids are confirmed.
- MapLibre is loaded from jsDelivr at the `@5` major. Pin an exact version once the integration settles.
