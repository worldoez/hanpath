# Hanpath — Mandarin & Cantonese Flashcards

A PWA for learning Chinese with spaced repetition. Inspired by
[Deckr](https://deckr.wiesnermartin.com/), rebuilt from scratch: a **2-in-1
Mandarin/Cantonese app** — 4,989 HSK 1–6 words (pinyin *and* jyutping), a
1,200-word spoken-Cantonese deck, 20 cross-level domain packs, browser
text-to-speech, custom decks with CSV import, per-card editing/hiding/history.
No build step, no framework, no backend.

## Features

- **Two languages, one app** — 中/粵 toggle on the home bar. Mandarin mode:
  pinyin + `zh-CN` voice. Cantonese mode: jyutping + `zh-HK` voice. Progress
  is tracked separately per language.
- **Spaced repetition (SRS)** — simplified SM-2: Forgot / Hard / Good / Easy
  grading, intervals from 10 minutes up to a year, mastery = interval ≥ 21 days.
- **HSK path** — the next level opens at 65% mastery of the previous one.
- **Spoken Cantonese** — three frequency-ranked tiers (Basics / Everyday /
  Wider) of authentic vocabulary with jyutping, from the words.hk corpus.
- **Domain packs** — Food, Travel, Body & Health, Tech, Feelings, … Each pulls
  matching words from every level you've unlocked.
- **Custom decks** — create in-app or import CSV (Deckr format:
  `english,chinese,pinyin`/`jyutping`). Quiz them like any other deck.
- **Card editing & hiding** — every card can be edited (stored as a personal
  override, built-in data untouched) or hidden (excluded from quizzes, counts
  and search). Hidden-card management in Settings.
- **Per-card history** — last 20 grades with timestamps, shown on the edit sheet.
- **Weakest first** — optional quiz ordering: lapses first, shortest interval
  first, lowest ease first.
- **Stats** — streak, review chart with 14/30/90-day ranges, characters seen,
  30-day accuracy.
- **Offline** — service worker caches the app shell and all data.
- **Local-only progress** — lives in the browser's localStorage; JSON backup
  export/import (merged, never overwritten; v1 backups auto-upgrade).

## Run locally

```sh
cd LearnChinese
python3 -m http.server 8642
# open http://localhost:8642
```

Any static file server works. The service worker only registers on `https://`
or `localhost`, so plain `file://` won't cache — use a server.

## Project structure

```
index.html            app shell (loads the three JS files, nothing else)
css/styles.css        all styling, light + dark theme via CSS variables
js/srs.js             spaced repetition engine (pure functions, no DOM)
js/tts.js             Web Speech API wrapper, zh-CN and zh-HK voices
js/app.js             everything else: router, views, quiz, decks, editor
data/hsk1..6.json     word lists: [{id, h: hanzi, p: pinyin, e: [english], l, d}]
data/jyutping.json    {hsk id: jyutping} for the HSK words
data/yue1..3.json     spoken-Cantonese tiers: [{id, h, p (jyutping), e, l}]
data/domains.json     domain → level → word ids, plus labels & counts
manifest.webmanifest  PWA manifest (name, icons, standalone display)
sw.js                 service worker, cache-first offline
icons/                192px + 512px icons (also apple-touch-icon)
scripts/build_data.py      builds data/hsk*.json + domains.json
scripts/build_cantonese.py builds data/jyutping.json + data/yue*.json
scripts/make_icons.py generated the icons
```

Card state keys encode the word source: `z:<id>` Mandarin HSK, `y:<id>`
Cantonese readings of HSK words, `s:<id>` spoken deck, `c<deckId>:<cid>` custom.

## Editing data

The `data/*.json` files are generated. `scripts/build_data.py` needs the raw
HSK 1–6 dump (`HSK_SRC` env var); `scripts/build_cantonese.py` needs the four
words.hk files in `/tmp` (wordslist/charlist/frequency/english index,
downloadable from https://words.hk/faiman/analysis/) plus
`pip3 install opencc-python-reimplemented` for simplified→traditional
conversion. Both scripts are safe to re-run any time.

Data licenses: HSK dump — scraped open course material; words.hk datasets —
public domain; wordshk/data2021-derived selection — CC-BY-NC 4.0 (personal,
non-commercial use).

## Changing code

Bump `CACHE_VERSION` in `sw.js` whenever you change any cached file, or
returning visitors will keep the old version until their browser re-checks.