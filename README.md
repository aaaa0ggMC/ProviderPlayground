# req-playground

An API request playground with template-driven variable interpolation and response transforms.

## Features

- **Request Templates** — Define API requests with URL, headers, body, and method. Use `{{varName}}` syntax for variable interpolation.
- **Dynamic Form** — Variables declared in templates are automatically rendered as input fields. Supports text, textarea, select, and secret inputs.
- **Response Viewer** — View raw response body, status code, and timing. Collapsible by default when transforms are present.
- **Response Transforms** — Apply post-request transforms to extract meaningful data:
  - `text` — Extract a JSONPath expression as plain text
  - `img` — Render a JSONPath value as an image
  - `audio-url` — Render a JSONPath value as an audio player
  - `video-url` — Render a JSONPath value as a video player
  - `task` — Poll an async task endpoint until completion, then apply sub-transforms
- **Global Variables** — Define variables at the app level that are merged into every request.
- **History** — Per-template send history with duration and error tracking. Click a history entry to quick-fill variable values.
- **Import / Export** — Export all templates, globals, saved values, and history to a JSON file. Import to restore.

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```