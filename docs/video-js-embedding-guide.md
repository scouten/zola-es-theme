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

## 2) Update the existing `es_cdn_video` shortcode for HLS

The project already has a shortcode at `templates/shortcodes/es_cdn_video.html` that uses progressive MP4 downloads. We'll update it to use Video.js with HLS streaming.

The shortcode follows the project's existing pattern:
- Uses `cdn_key` parameter for the CDN path (e.g., `vid/v1/2012/12/es-2251-027`)
- Uses `id` parameter for the asset ID (e.g., `es-2251-027`)
- Supports optional `title`, `caption`, and `creator` parameters
- Uses the `es_video` CSS class and `anti-section` class for styling consistency

Updated shortcode template:

```html
{# templates/shortcodes/es_cdn_video.html #}
{% set cdn_key = cdn_key | default(value="") %}
{% set poster = poster | default(value="") %}
{% set controls = controls | default(value=true) %}
{% set autoplay = autoplay | default(value=false) %}
{% set muted = muted | default(value=false) %}
{% set loop = loop | default(value=false) %}
{% set preload = preload | default(value="metadata") %}

{# Construct HLS master playlist URL from cdn_key #}
{% set hls_src = "https://img.ericscouten.com/" ~ cdn_key ~ "/hls/master.m3u8" %}

{# If no poster provided, try default poster.jpg location #}
{% if not poster %}
  {% set poster = "https://img.ericscouten.com/" ~ cdn_key ~ "/poster.jpg" %}
{% endif %}

<div class="es_video anti-section" id="{{ id }}">
  <video
    id="{{ id }}"
    class="video-js vjs-default-skin"
    {% if controls %}controls{% endif %}
    {% if autoplay %}autoplay{% endif %}
    {% if muted %}muted{% endif %}
    {% if loop %}loop{% endif %}
    preload="{{ preload }}"
    playsinline
    poster="{{ poster }}"
    data-setup='{"fluid": true, "responsive": true}'
  >
    <source src="{{ hls_src }}" type="application/x-mpegURL" />
  </video>
  {% if caption or title or creator -%}
  <div class="caption">
    {% if title -%}
      <span class="caption-title">{{ title }} </span>
      {% if caption or creator %} &middot; {% endif -%}
    {% endif -%}
    {% if caption -%}{{ caption }}{% endif -%}
    {% if creator -%}
      {% if title or caption %} &middot; {% endif -%}
      by {{ creator }}
    {% endif -%}
  </div>
  {%- endif -%}
</div>

{# Optional: per-player initialization hook #}
<script>
  (function () {
    if (window.videojs) {
      window.videojs(document.getElementById({{ id | json_encode() }}));
    }
  })();
</script>
```

### How to use the shortcode in Markdown

The shortcode usage matches the existing pattern in the project:

```text
{{ es_cdn_video(id = "es-2251-027", 
                cdn_key = "vid/v1/2012/12/es-2251-027", 
                caption = "Trem do Corcovado, Rio de Janerio, Brazil") }}
```

Common optional parameters:
- `title="..."` - Video title (bold in caption)
- `caption="..."` - Video caption text
- `creator="..."` - Creator attribution
- `poster="..."` - Custom poster image URL (defaults to `{cdn_key}/poster.jpg`)
- `controls=true|false` - Show playback controls (default: true)
- `autoplay=true|false` - Auto-start playback (default: false)
- `muted=true|false` - Mute audio (often required for autoplay, default: false)
- `loop=true|false` - Loop playback (default: false)
- `preload="none"|"metadata"|"auto"` - Preload behavior (default: "metadata")

---

## 3) Update CSS for Video.js integration

The project already has `.es_video` styling. Update your site CSS to work with Video.js:

```css
.es_video .video-js {
  width: 100%;
  height: auto;
}
```

The existing `.es_video` and `.anti-section` classes should handle spacing and layout.

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

Generate a `poster.jpg` during encoding (first frame or a frame near 1–2s). Store it at:

```
/vid/v1/{year}/{mo}/{pid}/poster.jpg
```

The shortcode will automatically use this location if no explicit `poster` parameter is provided.

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
- [ ] `templates/shortcodes/es_cdn_video.html` updated with HLS support
- [ ] HLS assets uploaded to CDN following `/vid/v1/{year}/{mo}/{pid}/hls/` structure
- [ ] CORS configured on CDN (img.ericscouten.com)
- [ ] MIME types correct for `.m3u8` and `.ts`
- [ ] Poster images generated at `/vid/v1/{year}/{mo}/{pid}/poster.jpg`
- [ ] Videos render responsively with existing theme styles
