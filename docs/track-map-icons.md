# Track map icons

Mode icons in the track map are hand-drawn line glyphs in `static/common/track-map.js` (`ICONS`). They are original drawings and carry no attribution requirement.

## Rules

Keep to these and a new glyph sits beside the others without looking borrowed.

- **Canvas** `viewBox="0 0 24 24"`, drawn inside a 2-unit margin: the live area is 20 × 20 centred at (12, 12).
- **Stroke** width 1.8, round caps and joins, `stroke="currentColor"`, `fill="none"`. The wrapper sets these; a glyph is only the inner markup.
- **Shapes** A few strokes rather than many. Circles for wheels and heads (`r` between 1.6 and 2.3), rounded rectangles for bodies (`rx="2"`), single paths for limbs, wings, hulls. No fills, gradients, or text.
- **Weight** Four to six strokes, about the ink of the car. Heavier glyphs read dark next to their neighbours at caption size.
- **Size** Judge it at 20 px (the caption renders at 1.25 rem), not at poster size.
- **Orientation** Vehicles and people face right.
- **No motion cues.** The caption names the mode; the icon only has to be scannable.

## Existing glyphs

| Mode | Key | Notes |
|---|---|---|
| `drive` | `car` | Body, cabin, two wheels |
| `walk` | `walk` | Striding figure |
| `hike` | `hike` | The walker plus a trekking pole at right |
| `run` | `run` | Leaning figure, longer stride |
| `bike` | `bike` | Two wheels, frame, handlebar |
| `bus` | `bus` | Tall rounded body, window line, two lights |
| `train` | `train` | Rounded body, window line, two lights, splayed rails below |
| `cable` | `cable` | Cabin hanging from a sloped line |
| `fly` | `jet` | Airliner from above, nose up, like an airport pictogram |
| `prop` | `prop` | Light aircraft from above: straight wings, propeller bar and spinner at the nose, tailplane. Side views were tried and read as carts at 20 px |
| `boat` | `boat` | Sailboat in side profile: hull, mast, sail, waves |
| `stop` | `pin` | Map pin |
| `taxi` | `taxi` | The car with a roof sign |
| `ferry` | `ferry` | Ship in side profile: long hull with a bow, superstructure with windows, funnel, waves |
| `tram` | `tram` | Rounded body with a pantograph above and a flat rail below |
| `horse` | `horse` | Chess-knight silhouette on a base: head and neck in profile with mane notches. Full-body drawings were tried and read as camels at 20 px |
| `kayak` | `kayak` | Long pointed hull with a paddle across it |
| `helicopter` | `heli` | Cabin, rotor bar, tail boom to the left, skids; faces right |
| (unknown) | `route` | Two nodes joined by an S-curve; used for legs without a mode |

## Adding a mode

1. Draw the glyph to the rules above. Paste it next to the car in a scratch HTML file and adjust until the weights match.
2. Add it to `ICONS` in `track-map.js`.
3. Add the mode to `MODES` with a display name and the glyph key. Add the token to `RIDES` (vehicles, drawn dashed) or `SELF` (self-powered, drawn dotted); add it to `TIMED` only if its caption may show a duration.
4. Add the token to the mode vocabulary in the track format spec so the CDN toolchain and Waysmith know it.
