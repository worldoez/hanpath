# Hanpath — notes for Claude sessions

Static PWA, vanilla JS, **no build step, no dependencies, no backend**. Three
plain `<script>` tags in `index.html` (srs.js → tts.js → app.js). Data is
pre-generated JSON in `data/`, fetched lazily per level.

## Conventions

- Word objects: `{id, h: hanzi, p: pinyin, e: [english up to 3], l: level 1-6,
  d: domain key or null}`. Keep keys short — the JSON is fetched on phones.
- Progress state shape is versioned via the `KEY` constant (`hanpath.v1`) in
  `js/app.js`. Bump the version and add a migration if the shape changes
  incompatibly; backups import by merging (never overwrite stronger cards).
- `js/srs.js` is pure (no DOM) and also used by `scripts/` tests via
  `module.exports` — keep it framework-free.
- Escaping: all user/data strings rendered into HTML go through `esc()`.

## Things that break silently if forgotten

- **Bump `CACHE_VERSION` in `sw.js` on every change** — cache-first SW means
  stale files otherwise.
- The SW only registers on `https:` or `localhost`; `file://` won't cache or
  install as a PWA.
- iOS: `apple-mobile-web-app-*` meta tags in `index.html` are what make
  "Add to Home Screen" full-screen; Safari ignores `display: standalone`
  from the manifest alone. Don't remove them.
- `data/*.json` are generated — edit `scripts/build_data.py` and re-run, never
  hand-edit the JSON (OneDrive sync can also leave 0-byte files if interrupted;
  re-run the script to regenerate).

## Testing changes

`python3 -m http.server 8642` then open http://localhost:8642. `node --check
js/*.js` for syntax; there is no test suite.