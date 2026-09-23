# Track legs: GPX authoring convention and the derived track JSON

Status: proposal, v1. Authored in Waysmith; published to the image CDN; consumed by this theme's track map (`docs/track-map.md`). Reference converter: `tools/gpx2track.py` in this repo.

Two representations, one source of truth:

| | Purpose | Written by | Read by | Published? |
|---|---|---|---|---|
| **GPX** (`*.gpx`) | Archival, editable source of truth. Carries timestamps and the legs. | Waysmith (Save) | Waysmith, any GPX tool | **No.** Stays private. |
| **Track JSON** (`*.json`) | Compact, display-ready derivative. Carries no clock times. | Waysmith (Export) or a script | zola-es-theme in the browser | Yes, on the CDN |

The JSON is always regenerable from the GPX plus the photo list. Nothing is hand-edited in JSON. The CDN toolchain produces it; Waysmith never writes JSON.

## 0. Privacy rule

Nothing public shows or ships a clock time. The JSON has no start or end instants, no per-point times, and no time zone. It carries two time-derived values:

- A **duration**, only on flight and boat legs (`fly`, `prop`, `helicopter`, `boat`, `ferry`), so a caption can read "Flying · 13,580 km / 8,439 mi" over "ATL → 14h 15min → CPT".
- **Flight-video clips** (§2.6), only for videos on `fly`, `prop`, and `helicopter` legs. A clip samples the track once a second of the video, so it reveals the pace of that stretch of the flight, but its times are seconds into the video, never clock times. This is a deliberate exception for flights.

Stops and other legs are described by place, mode, and distance only.

The GPX keeps everything (it is what makes editing and re-export possible) and is never uploaded to a public location.

---

## 1. GPX authoring convention

Plain GPX 1.1. No custom namespace is required for the core model; one optional extension element is defined in §1.4.

### 1.1 Legs are tracks

A day is a sequence of **legs**, each written as one `<trk>` in chronological order. A leg is a stretch of the day with one mode of travel, or a stop.

```xml
<trk>
  <name>Simon’s Town → Cape Point</name>
  <type>drive</type>
  <trkseg> …trkpt… </trkseg>
</trk>
<trk>
  <name>Cape Point</name>
  <type>stop</type>
  <trkseg> …trkpt… </trkseg>
</trk>
```

- `<name>` is the label shown in the widget caption. Free text. Optional; when absent the caption shows the mode and distance alone.
- `<type>` is the mode token (§1.2). Optional; when absent the leg is shown without a mode icon.
- A leg may contain several `<trkseg>` elements (a brief signal dropout inside one drive). Segments within a track are drawn as one leg; the gap between them is not a stop.
- Consecutive legs abut: the boundary point is the last point of one leg and the first point of the next. Consumers de-duplicate it.
- Files that predate this convention (one unnamed, untyped track) remain valid. See §3.4 for how they degrade.

### 1.2 Mode vocabulary

| `<type>` | Meaning | Glyph key in the theme |
|---|---|---|
| `drive` | Car or any private road vehicle you were riding in | `car` |
| `taxi` | Taxi or rideshare | `taxi` |
| `walk` | On foot, urban or beach | `walk` |
| `hike` | On foot, trail | `hike` |
| `bike` | Bicycle | `bike` |
| `horse` | On horseback | `horse` |
| `bus` | Bus or coach | `bus` |
| `train` | Rail: intercity, metro, funicular railway | `train` |
| `tram` | Tram or streetcar | `tram` |
| `cable` | Cable car, gondola, chairlift | `cable` |
| `boat` | Small boat, sailing, cruise (may carry a duration) | `boat` |
| `ferry` | Scheduled ferry (may carry a duration) | `ferry` |
| `kayak` | Kayak or canoe | `kayak` |
| `fly` | Airliner or jet (may carry a duration) | `jet` |
| `prop` | Light aircraft, flightseeing (may carry a duration) | `prop` |
| `helicopter` | Helicopter (may carry a duration) | `heli` |
| `stop` | Not travelling: a visit, a meal, a viewpoint | `pin` |

Unknown tokens are preserved and shown with a generic route icon and no mode name. Every leg is drawn as a solid line; the mode is conveyed by the caption and its icon. New tokens are added here and in the theme's mode and icon tables (`docs/track-map-icons.md`).

### 1.3 Stops

A stop is a leg with `<type>stop</type>`. Its points are whatever was recorded while stationary, which may be a single point when the logger paused, or a small cloud of GPS wander. Consumers use the centroid of its points; the wander is never drawn.

A stop is the unit that photo clusters attach to ("Cape Point"), so name stops as places. A stop may be as short as you like; the converter's own threshold for *inferring* a stop is 3 minutes, but an explicit `<type>stop</type>` is always honored.

### 1.4 Optional extension: origin of a leg

Waysmith reconstructs legs the logger missed (flights, tunnels, dead batteries). The display draws reconstructed legs differently from recorded ones, so the GPX records where a leg came from:

```xml
<trk>
  <name>ATL → CPT</name>
  <type>fly</type>
  <extensions>
    <ws:origin xmlns:ws="https://waysmith.app/gpx/1">synthesized</ws:origin>
  </extensions>
  <trkseg>…</trkseg>
</trk>
```

Values: `recorded` (default when absent), `routed` (replaced by a routing service), `synthesized` (generated, e.g. smooth flight path or great-circle). Anything else is treated as `recorded`. Origin is per leg: a route fix inside a drive does not change the drive's origin; a leg that is entirely reconstructed is marked.

### 1.5 Waypoints

`<wpt>` elements are passed through untouched. The logger's `Start` and `End` waypoints are ignored by the converter. Named waypoints are reserved for a later "points of interest along a leg" feature and are not interpreted in v1.

### 1.6 Metadata

`<metadata><name>` is passed through to the JSON as `name` when it is not a timestamp-shaped string (the logger's default name is one, and is dropped). `<metadata><time>` is never exported.

---

## 2. Track JSON v1

One file per page. Served from the CDN under `track/v2/YYYY/MM/<date>.json`, gzip-encoded by the CDN. The GPX it was derived from stays private.

Two version numbers, deliberately separate:

- The **CDN path** (`kml/v1/…` today, `track/v2/…` for this format) marks the pipeline generation. Once the retrofit is complete, everything under `v1` is what can be deleted.
- The **`v` field** inside the JSON is the schema version consumers check. It starts at 1 and only changes when the JSON shape changes incompatibly.

```json
{
  "v": 1,
  "dist_m": 166100,
  "bbox": [18.4023, -34.3571, 18.4747, -33.8996],
  "legs": [
    {
      "mode": "drive",
      "label": "Cape Town → Muizenberg",
      "dist_m": 35700,
      "ele": [5, 140],
      "pts": [[18.41206, -33.89974, 6], [18.41177, -33.89978, 12]]
    },
    {
      "mode": "stop",
      "label": "Muizenberg",
      "dist_m": 0,
      "pts": [[18.4321, -34.13599]]
    },
    {
      "mode": "fly",
      "label": "ATL → CPT",
      "origin": "synthesized",
      "dist_m": 13580000,
      "dur_s": 51300,
      "pts": [[-84.4281, 33.6407], [18.6021, -33.9715]]
    }
  ],
  "photos": [
    { "id": "lr-263-7376", "leg": 1, "i": 0, "f": 0.2138 }
  ]
}
```

### 2.1 Top level

| Field | Type | Notes |
|---|---|---|
| `v` | int | Format version. Consumers refuse files with a major version they don't know. |
| `name` | string? | From `<metadata><name>`, when it is a real title. |
| `dist_m` | int | Sum of moving legs, metres. Stops contribute 0. The map shows it as the day's total; the front-matter `distance` should read the same (§3.3). |
| `bbox` | [minLon, minLat, maxLon, maxLat] | Of all points. Replaces the hand-typed `bounds` in front matter when that is absent. |
| `days` | int? | How many calendar days the log covers, in the page's time zone. Written only when more than one: the map then calls the ends "Start of trip" and "End of trip" rather than "Start of day" and "End of day". A count of days is not a clock time. |
| `legs` | array | In chronological order. See §2.2. |
| `photos` | array? | Optional photo anchors. See §2.3. |
| `clips` | array? | Optional flight-video clips. See §2.6. |
| `parks` | array? | Optional boundaries of the parks the page highlights. See §2.7. |

### 2.2 Legs

| Field | Type | Notes |
|---|---|---|
| `mode` | string? | Token from §1.2, or absent when the GPX had no `<type>`. |
| `label` | string? | From `<name>`. |
| `origin` | string? | From §1.4. Absent means `recorded`. |
| `dist_m` | int | Metres along the (unsimplified) leg. 0 for stops. |
| `gain_m`, `loss_m` | int? | On `hike` and `walk` legs: metres climbed and descended, counting only changes of at least 5 m from the last altitude counted, since GPS altitude wobbles by a few metres. The caption shows them on a line of their own, the leg's main direction always and the other only from 10 m: "↑ 120 m / 390 ft", or "↑ 120 m / 390 ft · ↓ 15 m / 50 ft". |
| `dur_s` | int? | **Only on `fly`, `prop`, `helicopter`, `boat`, and `ferry` legs.** Seconds. Omitted everywhere else. |
| `ele` | [min, max]? | Metres. Present when elevation was recorded. Omitted on stops. |
| `pts` | array of [lon, lat, ele?] | Simplified geometry. `lon`, `lat` to 5 decimals (about 1 m). `ele` is whole metres; omitted when unknown. |

Simplification is Ramer–Douglas–Peucker with a 6 m cross-track tolerance on moving legs. That keeps a full day under about 1,500 points. A stop is reduced to one point at the centroid of its recorded points.

When photo anchors are produced (§2.3), simplification also keeps two recorded points for each photo: the one nearest in time to it, and the last one at or before it. The leg is split at those points and each stretch is simplified on its own, so the line passes where the photo was taken. Without photos this is plain Ramer–Douglas–Peucker. On the reference day it adds 11 points and brings the median distance from a photo to its anchor point from 21 m to 1 m (worst case 421 m to 39 m).

### 2.3 Photo anchors

Produced when the exporter knows the photo capture times, which Waysmith does when media were loaded into the document. The times are used at export and never written. Keyed by the same `id` used in `markers.js` and the `es_cdn_image` shortcodes.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Photo or video id. |
| `leg` | int | Index into `legs`. |
| `i` | int | Index into that leg's `pts` of the last point recorded at or before the photo, which simplification always keeps (§2.2). 0 for a photo taken before the leg starts. |
| `f` | number | Fraction of the day's `dist_m` travelled at the photo, 0 to 1. Drives the progress bar and the traveled-portion gradient. |

When `photos` is absent, or a photo id is missing from it, the theme falls back to the forward-constrained nearest-point rule: snap each photo, in page order, to the nearest track point at or after the previous photo's point. That works without timestamps and handles out-and-back roads.

### 2.4 Caption rules (what the reader sees)

| Leg | Caption |
|---|---|
| Moving leg with a label | `Driving · 36 km` over `Cape Town → Muizenberg` |
| Moving leg without a label | `Driving · 36 km` |
| Flight or boat leg (`fly`, `prop`, `helicopter`, `boat`, `ferry`) | `Flying · 13,580 km / 8,439 mi` over `ATL → 14h 15min → CPT`: the duration sits between the endpoints when the name has an arrow, otherwise after the name |
| Stop | `Cape Point` with the pin icon |
| Reconstructed leg (`origin` not `recorded`) | Same text; `origin` is kept in the JSON for tooling but the line is drawn the same way |

Progress reads as distance on the bar: `46 km / 28 mi` at the reader's position, `166 km / 103 mi` (the day's `dist_m`) at the right.

### 2.5 Size budget

The reference day (5,964 GPX points, 857 KB) becomes about 1,100 points and 27 KB before gzip. Flight-video clips add about 15 bytes a second of video. A page should stay under 100 KB of track JSON; a multi-day flight track that exceeds it should use a larger simplification tolerance for the flight legs.

### 2.6 Flight-video clips

Optional. For each video (by the same `id` as `photos`) taken on a `fly`, `prop`, or `helicopter` leg, the track under the rendered video, sampled once a second from its first frame. The toolchain places the rendered video in time from its capture time plus its in-point (the rendered file's XMP `xmpDM:startTimecode`, which is 00:00:00:00 at the start of the capture) and takes its length from `xmpDM:duration`. A video not wholly within one flight leg gets no clip.

```json
"clips": [ { "id": "es-268-1708", "leg": 0,
             "f": [0.93805, 0.93868, …], "kmh": [176, 175, …], "alt": [188, 187, …, null, …],
             "phase": [[0, "flying"], [6, "landing"], [96, "taxi"]] } ]
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Video id, as in `photos` and `markers.js`. |
| `leg` | int | Index into `legs`. |
| `f` | number[] | Sample *k* is *k* seconds into the video: the fraction of the day's `dist_m` travelled, as a photo's `f`. |
| `kmh` | int[] | Ground speed, km/h, measured over 5 s either side of the sample. |
| `alt` | (int \| null)[]? | Altitude, metres, from the log's elevation. `null` where that is nonsense: the whole of any dip below −5 m that reaches −10 m (nothing here flies below sea level). A reading a metre or two below sea level, as a floatplane on the water logs, is written as 0. Absent when every sample is `null`. |
| `phase` | [int, string][]? | Where each phase starts, in seconds into the video: `taxi`, `takeoff`, `flying`, or `landing`. Judged from ground speed alone, since the logged altitude is least reliable just after takeoff: below 40 km/h is taxiing, unless the aircraft stays above it for at least a minute, which is a flight, and a flight's first and last 90 s are its takeoff and landing. Only for `fly` and `prop` legs: a helicopter flies slowly or hovers. |

Once the reader starts a clip's video, and while it is the item in view, the map follows it: the dot, the traveled portion, and the progress bar move with the video, and the caption reads "Flying · 198 km/h / 123 mph" over "Altitude 610 m / 2,000 ft". "Flying" becomes "Taxiing", "Taking off", or "Landing" by `phase`. While taxiing, and where the altitude is `null`, the second line is the leg's label instead. A video the reader hasn't started leaves the map where its photo anchor puts it. `tools/gpx2track.py` does not write clips; `nf` does.

### 2.7 Parks

Optional. The boundaries of the parks a page highlights, chosen by hand in its front matter (§3.3). The toolchain fetches each from OpenStreetMap, simplifies it to within 5 m, and rounds it to five decimal places.

```json
"parks": [ { "osm": "relation/5291525", "name": "Guillemot Cove Nature Reserve",
             "polys": [ [ [[-122.91793, 47.61397], …] ] ] } ]
```

| Field | Type | Notes |
|---|---|---|
| `osm` | string | The OpenStreetMap relation or way, as `relation/<id>` or `way/<id>`. |
| `name` | string? | Its name in OpenStreetMap. |
| `polys` | array | GeoJSON MultiPolygon coordinates: each polygon an outline followed by its holes, each ring closed, as `[lon, lat]`. |

The map tints each park a subtle greyed sand, with no outline, beneath the basemap's labels and the track. Zooming to the whole day takes in the parks as well as the track.

---

## 3. How each tool uses this

### 3.1 Waysmith (authoring)

Waysmith is where legs are made and stays a pure GPX editor. Specified in `docs/trip-legs.md` on the Waysmith repo and implemented there (issues #63, #64, #65), in dependency order:

1. **Model and GPX round-trip.** `type` and `origin` on `Track`; parse and serialize `<trk><type>` and the `ws:origin` extension; pass `<wpt>` through.
2. **Leg editing.** Split the current track at the focused point; join with previous; set name and type from the SEGMENTS panel.
3. **Suggest legs.** Propose typed legs from speed, dwell, and climb rate through the existing proposal / confirm pattern.

Waysmith does not export JSON. The sanitized GPX it saves is the hand-off to the CDN toolchain.

### 3.1a CDN toolchain (publishing)

Today the toolchain converts GPX to KML, strips timestamps, and uploads. It becomes the GPX-to-JSON step instead. Reference implementation: `tools/gpx2track.py` in this repo, whose behaviour is the specification:

| Input | Output |
|---|---|
| Sanitized GPX from Waysmith (private, timestamps intact) | `track/v2/YYYY/MM/<date>.json` on the CDN, per §2 |
| Photo manifest for the page: `[{"id": "es-263-9512", "time": "2026-03-05T10:20:00Z"}, …]`, ids matching `markers.js` | `photos` anchors in the same JSON, per §2.3 |

Rules:

- **Legs present in the GPX win.** If the file has more than one `<trk>`, or any `<trk><type>`, each track becomes one leg verbatim. Nothing is inferred and nothing is re-split.
- **Legacy files are inferred.** One untyped track (every existing sanitized file) is split by the heuristic in §3.1 item 3 so an un-retrofitted page still gets legs. The result is a best effort, not authoritative; the page is retrofitted by editing legs in Waysmith and re-running the toolchain.
- **Never emit clock times** (§0). The GPX is not uploaded; KML is no longer produced.
- **Serve with CORS.** The theme fetches the JSON from the browser, cross-origin, so the object must be public and sent with `Access-Control-Allow-Origin: *` (the old KML was fetched by Google's servers and never needed this). `Content-Type: application/json`; compression as for other assets.
- **Photo capture times** come from the toolchain's own EXIF read (it already has the photos). Photos without a usable time are omitted from `photos`; the site falls back to nearest-point snapping for them.
- **Idempotent.** Re-running on unchanged inputs produces byte-identical JSON.

### 3.2 zola-es-theme

**The existing Google Maps / KML map keeps working, unchanged, for as long as the transition takes.** Selection is per page, not per site:

| Page front matter | Map shown |
|---|---|
| `track_key = "track/v2/…json"` (or `track_url`) | New corner map (this design). |
| `track_log_key = "kml/v1/…kml"` and no `track_key` | Existing Google map, exactly as today. |
| `markers` only, no track of either kind | Existing Google map with markers, as today (65 pages). Later: optionally the new map with photo dots and no route. |
| `lat` / `lon` only | Existing Google map, as today (used by other sites on the theme). |

Concretely:

- The current `map.html` is untouched. A new partial (`track_map.html`) is included by `page.html` only when `page.extra.track_key` or `page.extra.track_url` is set (and the site has enabled `extra.track_map`); otherwise `map.html` runs as before. No existing page changes behaviour until its front matter changes.
- The new partial reads one track JSON and the page's photo list, renders the corner widget, the docking slot, and the expanded view, and draws legs by mode and origin. It never reads GPX or KML.
- Icon map for §1.2 tokens: the theme's own hand-drawn glyph set (`docs/track-map-icons.md`).
- Site-level config: an `[extra.track_map]` table enables the new partial at all (so 146parks.blog and ericscouten.dev see no change until opted in), plus basemap style choices.
- The Google API key and the `GOOGLE_API_KEY` environment lookup stay in place until the last page has migrated, at which point removing `map.html` is a separate, deliberate change.

### 3.3 ericscouten.travel front matter

```toml
[extra]
track_key = "track/v2/2026/03/2026-03-05.json"   # presence of this key selects the new map
distance = "166 km / 103 mi"                  # the JSON's dist_m (166100) as the map writes it
bounds = { … }                                # optional: overrides the JSON's bbox
markers = "markers.js"                        # unchanged; ids must match photo anchors
parks = ["relation/5291525"]                  # optional: parks to highlight (§2.7), by OpenStreetMap relation or way
```

Migrating a page is a front-matter edit after the JSON is on the CDN. `nf update-blog-for-track-map` sets `track_key` and `distance` and removes `track_log_key`, so a search for `track_log_key` finds the pages still to migrate. Reverting a page is deleting `track_key` and restoring `track_log_key`. Pages are migrated in whatever order and at whatever pace suits; nothing forces a bulk change.

Per-page leg overrides are deliberately **not** in front matter. Legs are edited in Waysmith and saved in the GPX, so the GPX stays the single place where a day's structure lives.

### 3.4 Degradation for un-retrofitted files

A GPX with one unnamed, untyped track (every file today) converts to a JSON with one leg, no `mode`, no `label`. The widget draws the route and the traveled portion, shows only the distance as the caption, and anchors photos by the nearest-point rule. Retrofitting a page means opening the GPX in Waysmith, accepting or correcting suggested legs, saving, exporting, and uploading the JSON.

A KML with only coordinates converts the same way.

---

## 4. Open questions

1. Should `hike` and `walk` stay distinct, or is one on-foot token enough?
2. Should a stop show its duration ("Cape Point · 10 min")? The privacy rule as written says no; a dwell time is not a clock time, so this is a judgment call.
3. Does the CDN toolchain already know each photo's capture time when it writes `markers.js`? If so the photo manifest in §3.1a is a by-product of that step.
