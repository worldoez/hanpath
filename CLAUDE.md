# Hanpath — notes for Claude sessions

Static PWA, vanilla JS, **no build step, no dependencies, no backend**. Three
plain `<script>` tags in `index.html` (srs.js → tts.js → app.js). Data is
pre-generated JSON in `data/`, fetched lazily.

## Conventions

- Word objects: `{id, h: hanzi, p: romanization, e: [english up to 3], l:
  level/tier, d: domain key or null}` plus a runtime `_k` kind. Keep keys
  short — the JSON is fetched on phones.
- **Card keys encode source AND language**: `z:<id>` = HSK word in Mandarin
  mode, `y:<id>` = the same HSK word in Cantonese mode (jyutping from
  `data/jyutping.json`), `s:<id>` = spoken-Cantonese deck, `c<deckId>:<cid>` =
  custom deck card. The kind prefix MUST be assigned per active language
  (`kWords()` in app.js) — progress for one language never touches the other.
  Never mix: spoken-deck ids and HSK ids are both plain integers, so the
  distinct "s" vs "y" prefixes are what prevents collisions.
- State shape is versioned via `KEY` (`hanpath.v2`). `migrateState()` upgrades
  v1 (bare numeric card ids → `z:<id>`) and fills new fields. Backup import
  goes through the same path — keep it that way when the shape changes.
- Per-card overrides live in `store.cards[key].o = {h,p,e}`; per-card review
  history in `card.h = [{t, g}]` capped at 20 (appended in `SRS.grade`).
- `js/srs.js` is pure (no DOM) — keep it framework-free.
- Escaping: all user/data strings rendered into HTML go through `esc()`.

## Things that break silently if forgotten

- **Bump `CACHE_VERSION` in `sw.js` on every change** — cache-first SW means
  stale files otherwise.
- The SW only registers on `https:` or `localhost`; `file://` won't cache or
  install as a PWA.
- iOS: `apple-mobile-web-app-*` meta tags in `index.html` make "Add to Home
  Screen" full-screen. Don't remove them.
- `data/*.json` are generated — edit `scripts/build_data.py` /
  `scripts/build_cantonese.py` and re-run, never hand-edit the JSON (OneDrive
  sync can also leave 0-byte files if interrupted; re-run to regenerate).
- `scripts/build_cantonese.py` needs the words.hk files in /tmp (see README)
  and opencc-python-reimplemented. words.hk data is traditional Chinese —
  that's why the s2t conversion is required before lookup.

## Testing changes

`python3 -m http.server 8642` then open http://localhost:8642. `node --check
js/*.js` for syntax; there is no test suite.