# Video.js embedding guide for a Zola (Tera) static site

This guide shows how to embed **self-hosted HLS (VOD)** videos (e.g., `.../hls/master.m3u8`) in a Zola site using **Video.js**.

Assumptions:
- Your videos are hosted on a CDN / public bucket.
- Each video has a `master.m3u8` HLS playlist (and `v0..vN` variants).
- You want a simple, repeatable embed pattern (shortcode) for posts/pages.

---

## Why Video.js

Video.js provides a consistent player UI and supports HLS/DASH via **VHS** (Video.js HTTP Streaming), which is built into Video.js 7+.

---

## 1) Add Video.js assets to your site

### Option A (recommended): include via a CDN

Pin an explicit version so a future major release doesn’t unexpectedly change behavior.

Add the following to your global base template (commonly `templates/base.html` or similar):

```html
{# Video.js CSS #}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/video.js@8.23.4/dist/video-js.min.css">

{# Video.js JS (includes VHS) #}
<script defer src="https://cdn.jsdelivr.net/npm/video.js@8.23.4/dist/video.min.js"></script>
```

Notes:
- `defer` ensures the script loads after HTML parsing.
- If you already have a script pipeline, you can place the `<script>` at the end of `<body>` instead.

### Option B: vendor locally (no external CDN dependency)

Download the pinned assets and commit them into your repo (or mirror them into your own bucket). For example:

```
static/vendor/videojs/video-js.min.css
static/vendor/videojs/video.min.js
```

Then include them:

```html
<link rel="stylesheet" href="{{ get_url(path='vendor/videojs/video-js.min.css') }}">
<script defer src="{{ get_url(path='vendor/videojs/video.min.js') }}"></script>
```

---

## 2) Create a Zola shortcode for video embeds

Create a file:

```
templates/shortcodes/video.html
```

Suggested shortcode template (responsive + optional poster + optional class):

```html
{# templates/shortcodes/video.html #}
{% set src = src | default(value="") %}
{% set poster = poster | default(value="") %}
{% set class = class | default(value="") %}
{% set controls = controls | default(value=true) %}
{% set autoplay = autoplay | default(value=false) %}
{% set muted = muted | default(value=false) %}
{% set loop = loop | default(value=false) %}
{% set preload = preload | default(value="metadata") %}

{# A unique-ish id so multiple players can coexist on a page #}
{% set id = id | default(value="vjs-" ~ get_random(start=100000, end=999999)) %}

<div class="video-embed {% if class %}{{ class }}{% endif %}">
  <video
    id="{{ id }}"
    class="video-js vjs-default-skin"
    {% if controls %}controls{% endif %}
    {% if autoplay %}autoplay{% endif %}
    {% if muted %}muted{% endif %}
    {% if loop %}loop{% endif %}
    preload="{{ preload }}"
    playsinline
    {% if poster %}poster="{{ poster }}"{% endif %}
    data-setup='{"fluid": true, "responsive": true}'
  >
    <source src="{{ src }}" type="application/x-mpegURL" />
  </video>
</div>

{# Optional: per-player initialization hook (usually not required) #}
<script>
  (function () {
    // If Video.js is loaded, initializing is optional when using data-setup,
    // but explicit init lets you attach events consistently.
    if (window.videojs) {
      window.videojs(document.getElementById({{ id | json_encode() }}));
    }
  })();
</script>
```

### How to use the shortcode in Markdown

```text
{{ video(src="https://cdn.example.com/video/my-asset/hls/master.m3u8",
         poster="https://cdn.example.com/video/my-asset/poster.jpg") }}
```

Common optional parameters:
- `controls=true|false`
- `autoplay=true|false`
- `muted=true|false`  (often required if you use autoplay)
- `loop=true|false`
- `preload="none"|"metadata"|"auto"`
- `class="..."`
- `id="..."` (if you need stable IDs for custom scripts)

---

## 3) Add minimal CSS for spacing and max width

Add something like this to your site CSS (wherever you keep styles):

```css
.video-embed {
  margin: 1rem 0;
}

.video-embed .video-js {
  width: 100%;
  height: auto;
}
```

If you want a max width (e.g., keep videos from becoming enormous on ultrawide monitors):

```css
.video-embed {
  max-width: 960px;
}
```

---

## 4) Playback expectations and gotchas

### HLS compatibility notes

- Safari/iOS: HLS is supported natively.
- Most other modern browsers: Video.js (VHS) plays HLS via Media Source Extensions (MSE).

### CORS requirements (CDN on different origin)

If your blog is on `www.example.com` and your videos are on `cdn.example.com`, you need CORS configured on the CDN/bucket.

Minimum that usually works:
- Allow methods: `GET`, `HEAD`
- Allow headers: `Origin`, `Range`
- Expose headers: `Content-Length`, `Content-Range`

### Correct MIME types

Ensure your CDN serves:
- `.m3u8` as `application/vnd.apple.mpegurl` (or `application/x-mpegURL`)
- `.ts` as `video/MP2T`

### Autoplay policy

Most browsers block autoplay with sound.
If you want autoplay in special cases:
- set `autoplay=true` and `muted=true`
- consider showing controls anyway

### Cache considerations

If your assets are immutable (recommended):
- segments can be cached for a year with `immutable`
- playlists can also be cached long if immutable, otherwise keep playlist caching short

---

## 5) Optional enhancements

### Captions (WebVTT)

If you produce VTT files, add tracks:

```html
<track kind="subtitles" src="https://cdn.example.com/video/my-asset/subs/en.vtt" srclang="en" label="English" default>
```

You can make `tracks` a shortcode parameter later if you want.

### Quality selector UI

Video.js can be extended with plugins to expose quality selection controls. This is optional — ABR usually “just works” without UI.

### Poster generation

Generate a `poster.jpg` during encoding (first frame or a frame near 1–2s). Store it alongside the HLS output and reference it in the shortcode.

---

## Recommended “starter defaults”

For blog video embeds, these defaults are usually comfortable:
- `controls=true`
- `preload="metadata"`
- `autoplay=false`
- `muted=false`
- `fluid=true` (responsive)
- `poster` provided when available

---

## Quick checklist

- [ ] Video.js CSS and JS included site-wide (pinned version)
- [ ] `templates/shortcodes/video.html` created
- [ ] HLS `master.m3u8` URLs accessible publicly
- [ ] CORS configured if cross-domain
- [ ] MIME types correct for `.m3u8` and `.ts`
- [ ] Videos render responsively in your theme
