/* Hanpath — Mandarin & Cantonese flashcards. Vanilla JS, no build step. */
"use strict";

/* ---------------- constants & state ---------------- */
const LEVEL_NAMES = { 1: "HSK 1", 2: "HSK 2", 3: "HSK 3", 4: "HSK 4", 5: "HSK 5", 6: "HSK 6" };
const LEVEL_GLYPH = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" };
const TIER_NAMES = { 1: "Basics · 基礎", 2: "Everyday · 日常", 3: "Wider · 進階" };
const TIER_GLYPH = { 1: "粵一", 2: "粵二", 3: "粵三" };
const DOMAIN_GLYPH = { food: "🍜", travel: "🧳", transport: "🚌", family: "👨‍👩‍👧", people: "🧑‍🏫", time: "🕐", numbers: "🔢", places: "🏙️", body: "🩺", weather: "🌤️", nature: "⛰️", work: "💼", money: "🛍️", tech: "💻", clothes: "👕", feelings: "💗" };
const KEY = "hanpath.v2";
const DATA = {};          // hsk level -> word array (_k:"z"), lazy
const YDATA = {};         // yue tier -> word array (_k:"y"), lazy
let DOMAIN_META = null;   // {labels, counts}
let JYUT = {};            // hsk id -> jyutping (loaded in yue mode)
let INDEX = null;         // cardKey -> word, for hidden management & search

function defaultState() {
  return {
    v: 2,
    cards: {},       // "z:<id>" | "y:<id>" | "c<deckId>:<cid>" -> {e,i,r,lp,d,o,h}
    hist: {},        // 'YYYY-MM-DD' -> {r: reviews, c: correct, n: newCards}
    decks: {},       // deckId -> {name, cards:[{cid,h,p,e}], next, created}
    hidden: {},      // cardKey -> 1
    settings: { dailyNew: 10, sessionLen: 15, rate: 0.9, reverse: false, theme: "auto", lang: "zh", weakest: false },
  };
}
function migrateState(raw) {
  const s = defaultState();
  Object.assign(s, raw);
  s.cards = raw.cards || {};
  if (raw.v !== 2) {
    const cards = {};
    for (const [id, c] of Object.entries(s.cards)) cards[/^\d+$/.test(id) ? "z:" + id : id] = c;
    s.cards = cards;
    s.v = 2;
  }
  s.decks = s.decks || {}; s.hidden = s.hidden || {};
  s.settings = Object.assign(defaultState().settings, s.settings || {});
  return s;
}
let store = defaultState();
try {
  const v2 = localStorage.getItem(KEY);
  const v1 = v2 ? null : localStorage.getItem("hanpath.v1");
  if (v2) store = migrateState(JSON.parse(v2));
  else if (v1) store = migrateState(JSON.parse(v1)); // one-time upgrade from the Mandarin-only version
} catch (e) { /* private mode etc. — run with defaults */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dayKeyOffset(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function record(correct, isNew) {
  const k = todayKey();
  const h = store.hist[k] || (store.hist[k] = { r: 0, c: 0, n: 0 });
  h.r++; if (correct) h.c++; if (isNew) h.n++;
  save();
}
function streak() {
  const start = (store.hist[todayKey()] || {}).r ? 0 : 1;
  let s = 0;
  for (let i = start; i < 3650; i++) {
    const h = store.hist[dayKeyOffset(i)];
    if (h && h.r > 0) s++; else break;
  }
  return s;
}
function lang() { return store.settings.lang; }

/* ---------------- data loading ---------------- */
async function loadLevel(l) {
  if (DATA[l]) return DATA[l];
  const arr = await (await fetch("data/hsk" + l + ".json")).json();
  for (const w of arr) w._k = "z";
  return (DATA[l] = arr);
}
async function loadYue(t) {
  if (YDATA[t]) return YDATA[t];
  const arr = await (await fetch("data/yue" + t + ".json")).json();
  for (const w of arr) w._k = "s";   // "s" = spoken deck — keeps ids clear of "y:<hsk id>"
  return (YDATA[t] = arr);
}
async function loadDomainMeta() {
  if (DOMAIN_META) return DOMAIN_META;
  DOMAIN_META = await (await fetch("data/domains.json")).json();
  return DOMAIN_META;
}
async function loadJyut() {
  if (Object.keys(JYUT).length) return JYUT;
  JYUT = await (await fetch("data/jyutping.json")).json();
  return JYUT;
}
function cardKey(w) { return w._k + ":" + w.id; }   // custom decks: _k is "c<deckId>"
function cardOf(w) { return store.cards[cardKey(w)] || SRS.newCard(); }
function effWord(w) {
  const c = store.cards[cardKey(w)];
  const o = c && c.o;
  if (!o) return w;
  return Object.assign({}, w, {
    h: o.h !== undefined ? o.h : w.h,
    p: o.p !== undefined ? o.p : w.p,
    e: o.e !== undefined ? o.e : w.e,
  });
}
function rom(w) {
  const e = effWord(w);
  const c = store.cards[cardKey(w)];
  const overridden = c && c.o && c.o.p !== undefined;
  if (w._k === "y" && JYUT[w.id] && !overridden) return JYUT[w.id];
  return e.p;
}
function isHidden(w) { return !!store.hidden[cardKey(w)]; }
function visWords(words) { return words.filter(w => !isHidden(w)); }
function levelCards(words) { return visWords(words).map(w => cardOf(w)); }
// HSK words carry the active language's kind: "z" (Mandarin) or "y" (Cantonese
// readings of the same word list). Spoken-deck words are "s", custom are "c*".
function kWords(words) {
  const k = lang() === "yue" ? "y" : "z";
  return words.map(w => ({ ...w, _k: k }));
}

async function hskMastery(l, k) {
  const words = await loadLevel(l);
  const cards = words.map(w => cardOf({ _k: k, id: w.id })).filter(c => !store.hidden[k + ":" + w.id]);
  return SRS.pct(cards);
}
async function tierMastery(t) {
  const words = await loadYue(t);
  return SRS.pct(levelCards(words));
}
async function unlockedHsk() {
  const k = lang() === "yue" ? "y" : "z";
  const out = [];
  for (let l = 1; l <= 6; l++) {
    if (l === 1 || (await hskMastery(l - 1, k)) >= SRS.UNLOCK_PCT) out.push(l); else break;
  }
  return out;
}
async function unlockedTiers() {
  const out = [1];
  for (const t of [2, 3]) {
    if (await tierMastery(t - 1) >= SRS.UNLOCK_PCT) out.push(t); else break;
  }
  return out;
}

/* ---------------- helpers ---------------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
}
function chipFor(card) {
  if (card.r === 0) return '<span class="chip new">new</span>';
  if (SRS.isMastered(card)) return '<span class="chip mastered">mastered</span>';
  if (card.lp > 0 && card.i < 2) return '<span class="chip shaky">shaky</span>';
  return '<span class="chip learning">learning</span>';
}
function speakBtn(hanzi) {
  return `<button class="speak" data-speak="${esc(hanzi)}" aria-label="speak">🔊</button>`;
}
function editBtn(w) {
  return `<button class="editw" data-edit="${esc(cardKey(w))}" title="Edit card">✎</button>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-speak]");
  if (b) { e.stopPropagation(); TTS.speak(b.dataset.speak, store.settings.rate, lang()); }
});

/* ---------------- navigation ---------------- */
const app = document.getElementById("app");
let nav = ["home"];
function go(view, push = true) {
  if (push) nav.push(view);
  render(view);
  window.scrollTo(0, 0);
}
function back() { if (nav.length > 1) { nav.pop(); render(nav[nav.length - 1]); } else goHome(); }
function topbar(title, extra = "") {
  return `<div class="topbar"><button class="back" onclick="back()">‹</button><h1>${esc(title)}</h1>${extra}</div>`;
}

/* ---------------- home ---------------- */
async function renderHome() {
  const L = lang();
  const unlockedH = await unlockedHsk();
  const unlockedT = await unlockedTiers();
  const domainMeta = await loadDomainMeta();
  if (L === "yue") await loadJyut();

  const histToday = store.hist[todayKey()] || { r: 0, c: 0, n: 0 };
  const newAllow = Math.max(0, store.settings.dailyNew - histToday.n);
  const dueCounts = { due: 0, new: 0 };
  const k = L === "yue" ? "y" : "z";
  const countDue = (words, kind) => {
    for (const w of words) {
      const key = kind + ":" + w.id;
      if (store.hidden[key]) continue;
      const c = cardOf({ _k: kind, id: w.id });
      if (SRS.isDue(c)) dueCounts.due++;
      else if (c.r === 0 && newAllow > 0) { dueCounts.new++; newAllow--; }
    }
  };
  for (const l of unlockedH) countDue(await loadLevel(l), k);
  if (L === "yue") for (const t of unlockedT) countDue(await loadYue(t), "s");

  const total = dueCounts.due + dueCounts.new;
  const st = streak();

  let decksHtml = "";
  const m = new Map();
  for (const l of unlockedH) m.set(l, await hskMastery(l, k));
  for (let l = 1; l <= 6; l++) {
    const unlockedL = unlockedH.includes(l);
    const words = await loadLevel(l);
    decksHtml += `
      <button class="deck ${unlockedL ? "" : "locked"}" data-level="${l}">
        <div class="glyph">${LEVEL_GLYPH[l]}</div>
        <div class="info">
          <div class="name">${LEVEL_NAMES[l]} <span class="faint">· ${words.length} words</span></div>
          <div class="bar"><i style="width:${unlockedL ? m.get(l) : 0}%"></i></div>
        </div>
        <div class="pct">${unlockedL ? m.get(l) + "%" : "🔒"}</div>
      </button>`;
  }

  let tiersHtml = "";
  if (L === "yue") {
    const tm = new Map();
    for (const t of unlockedT) tm.set(t, await tierMastery(t));
    for (let t = 1; t <= 3; t++) {
      const unlockedT1 = unlockedT.includes(t);
      const words = await loadYue(t);
      tiersHtml += `
        <button class="deck gold ${unlockedT1 ? "" : "locked"}" data-tier="${t}">
          <div class="glyph">${TIER_GLYPH[t]}</div>
          <div class="info">
            <div class="name">${TIER_NAMES[t]} <span class="faint">· ${words.length} words</span></div>
            <div class="bar"><i style="width:${unlockedT1 ? tm.get(t) : 0}%"></i></div>
          </div>
          <div class="pct">${unlockedT1 ? tm.get(t) + "%" : "🔒"}</div>
        </button>`;
    }
  }

  let domainsHtml = "";
  if (Object.keys(domainMeta.counts).length) {
    for (const [key, counts] of Object.entries(domainMeta.counts)) {
      const avail = Object.entries(counts).filter(([l]) => unlockedH.includes(+l));
      const n = avail.reduce((s, [, c]) => s + c, 0);
      if (n < 12) continue;
      domainsHtml += `
        <button class="deck gold" data-domain="${key}">
          <div class="glyph">${DOMAIN_GLYPH[key] || "📚"}</div>
          <div class="info"><div class="name">${esc(domainMeta.labels[key])}</div>
          <div class="sub">${n} words from your unlocked levels</div></div>
        </button>`;
    }
  }

  app.innerHTML = `
    <div class="topbar"><h1>Hanpath</h1>
      <button class="langtoggle" id="langtoggle" title="Switch language">${L === "yue" ? "粤" : "中"}</button>
      <button class="iconbtn" data-go="mydecks" title="My decks">📚</button>
      <button class="iconbtn" data-go="search" title="Search">🔍</button>
      <button class="iconbtn" data-go="stats" title="Stats">📊</button>
      <button class="iconbtn" data-go="settings" title="Settings">⚙️</button></div>
    <div class="hero">
      <div class="label">${greeting()}</div>
      <div class="due">${total}</div>
      <div class="label">cards ready ${histToday.r ? "· " + histToday.r + " reviewed today" : ""}</div>
      <div class="streak">🔥 ${st}-day streak</div>
      ${total ? `<button class="btn block" data-go="review">Start studying →</button>` : `<div class="muted" style="opacity:.85">Come back later — spaced repetition needs time to work. ✨</div>`}
    </div>
    <div class="section-title">${L === "yue" ? "Cantonese readings · HSK path" : "HSK path"} · ${SRS.UNLOCK_PCT}% mastery unlocks the next level</div>
    ${decksHtml}
    ${L === "yue" ? `<div class="section-title">Spoken Cantonese · 日常廣東話</div>${tiersHtml}` : ""}
    <div class="section-title">Domain packs</div>
    ${domainsHtml || '<div class="muted">Unlock HSK levels to open domain packs.</div>'}`;

  document.getElementById("langtoggle").onclick = () => {
    store.settings.lang = L === "yue" ? "zh" : "yue";
    save();
    goHome();
    toast(store.settings.lang === "yue" ? "廣東話 mode — jyutping + 廣東話 audio 🇭🇰" : "普通话 mode — pinyin + Mandarin audio 🇨🇳");
  };
}
function greeting() {
  const h = new Date().getHours();
  if (lang() === "yue") return h < 12 ? "早晨 — good morning" : h < 18 ? "午安 — good afternoon" : "晚安 — good evening";
  return h < 12 ? "早上好 — good morning" : h < 18 ? "下午好 — good afternoon" : "晚上好 — good evening";
}

/* ---------------- word rows ---------------- */
function wordRow(w) {
  const e = effWord(w);
  return `
    <div class="word">
      <span class="hz">${esc(e.h)}</span>${speakBtn(e.h)}
      <span class="py">${esc(rom(w))}</span>
      <span class="en">${esc(e.e.join("; "))}</span>
      ${editBtn(w)}${chipFor(cardOf(w))}
    </div>`;
}

/* ---------------- deck detail (HSK + tiers) ---------------- */
async function renderDeck(l) {
  const isTier = lang() === "yue" && isNaN(+l) && String(l).startsWith("t");
  const tier = isTier ? +String(l).slice(1) : null;
  const words = isTier ? await loadYue(tier) : kWords(await loadLevel(+l));
  const name = isTier ? TIER_NAMES[tier] : LEVEL_NAMES[+l];
  const cards = levelCards(words);
  const pct = SRS.pct(cards);
  const due = cards.filter(c => SRS.isDue(c)).length;
  const mastered = cards.filter(c => SRS.isMastered(c)).length;
  const nHidden = words.length - visWords(words).length;
  const SHOW = 60;
  const quizTarget = isTier ? "t" + tier : String(+l);
  app.innerHTML = `
    ${topbar(name)}
    <div class="card">
      <div class="muted">${words.length - nHidden} words${nHidden ? ` · ${nHidden} hidden` : ""} · ${mastered} mastered · ${due} due</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="faint" style="margin-top:6px">${pct}% mastered (interval ≥ ${SRS.MASTERED_DAYS} days)</div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" data-go="quiz:flip:${quizTarget}">Study</button>
        <button class="btn" data-go="quiz:choice:${quizTarget}">Multiple choice</button>
        <label class="weaktoggle"><input type="checkbox" id="weakest" ${store.settings.weakest ? "checked" : ""}> Weakest first</label>
      </div>
    </div>
    <div class="card"><div class="section-title" style="margin-top:0">Words</div><div id="words"></div>
      <button class="btn ghost block" id="more" style="margin-top:10px">Show more</button></div>`;
  document.getElementById("weakest").onchange = e => { store.settings.weakest = e.target.checked; save(); };
  let shown = 0;
  const box = document.getElementById("words");
  function chunk() {
    const slice = visWords(words).slice(shown, shown + SHOW);
    box.insertAdjacentHTML("beforeend", slice.map(wordRow).join(""));
    shown += slice.length;
    if (shown >= words.length - nHidden) document.getElementById("more").style.display = "none";
  }
  chunk();
  document.getElementById("more").onclick = chunk;
}

/* ---------------- custom decks ---------------- */
function deckWord(deckId, entry) {
  return { id: entry.cid, h: entry.h, p: entry.p, e: entry.e, _k: "c" + deckId };
}
async function renderMyDecks() {
  const deckIds = Object.keys(store.decks);
  let decksHtml = "";
  for (const id of deckIds) {
    const d = store.decks[id];
    const words = d.cards.map(c => deckWord(id, c)).filter(w => !isHidden(w));
    const pct = SRS.pct(words.map(cardOf));
    decksHtml += `
      <button class="deck" data-cdeck="${id}">
        <div class="glyph">📗</div>
        <div class="info">
          <div class="name">${esc(d.name)} <span class="faint">· ${words.length} words</span></div>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="pct">${pct}%</div>
      </button>`;
  }
  app.innerHTML = `
    ${topbar("My decks")}
    ${decksHtml || '<div class="card muted">No custom decks yet. Create one or import a CSV — Deckr-format files work as-is.</div>'}
    <div class="card">
      <div class="section-title" style="margin-top:0">New deck</div>
      <input class="search" id="deckname" placeholder="Deck name…">
      <div class="faint" style="margin:8px 0 6px">Paste CSV (header row: english, chinese, pinyin — or jyutping) or pick a file:</div>
      <textarea class="csvbox" id="csvtext" rows="5" placeholder="english,chinese,pinyin&#10;hello,你好,nǐ hǎo&#10;thank you,多謝,do1 ze6"></textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="create">Create deck</button>
        <button class="btn" id="csvfilebtn">Upload CSV file</button>
        <input type="file" id="csvfile" accept=".csv,text/csv" style="display:none">
      </div>
    </div>`;
  const parse = () => {
    const name = document.getElementById("deckname").value.trim();
    const text = document.getElementById("csvtext").value;
    if (!name) return toast("Give the deck a name first");
    const cards = parseCSV(text);
    if (!cards.length) return toast("Couldn't read any rows from that CSV");
    createDeck(name, cards);
  };
  document.getElementById("create").onclick = parse;
  document.getElementById("csvfilebtn").onclick = () => document.getElementById("csvfile").click();
  document.getElementById("csvfile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      document.getElementById("csvtext").value = r.result;
      if (!document.getElementById("deckname").value.trim())
        document.getElementById("deckname").value = f.name.replace(/\.(csv|txt)$/i, "");
      parse();
    };
    r.readAsText(f);
  };
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const cells = lines.map(l => l.split(",").map(c => c.trim()));
  let header = null;
  if (/english|chinese|pinyin|jyutping/i.test(cells[0].join(","))) header = cells.shift().map(h => h.toLowerCase());
  const cards = [];
  for (const row of cells) {
    if (row.length < 2) continue;
    let en, cn, py = "";
    if (header) {
      const iEn = header.findIndex(h => h.includes("english")), iCn = header.findIndex(h => h.includes("chinese"));
      const iPy = header.findIndex(h => h.includes("pinyin") || h.includes("jyutping"));
      if (iCn < 0) continue;
      en = row[iEn >= 0 ? iEn : 0]; cn = row[iCn]; py = iPy >= 0 ? row[iPy] : "";
      if (iEn < 0 && iPy >= 0) { en = row[iPy]; py = ""; }  // chinese,romanization header without english
    } else {
      // no header: column with hanzi is chinese; a column of tone-marked latin is pinyin; else english
      const hasTones = row.map(c => /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]|jyut|^[a-z]+[1-6]([ -][a-z]+[1-6])*$/i.test(c));
      const iCn = hasHanziIdx(row);
      if (iCn < 0) continue;
      cn = row[iCn];
      const iPy = row.findIndex((c, i) => i !== iCn && hasTones);
      if (iPy >= 0) { py = row[iPy]; const iEn = row.findIndex((c, i) => i !== iCn && i !== iPy); en = row[iEn >= 0 ? iEn : 0]; }
      else { const iEn = row.findIndex((c, i) => i !== iCn); en = row[iEn >= 0 ? iEn : 0]; }
    }
    if (!cn || !en) continue;
    cards.push({ h: cn, p: py, e: en.split(/; ?|\| ?/).slice(0, 3) });
  }
  return cards;
}
function hasHanziIdx(row) { return row.findIndex(c => /[一-鿿]/.test(c)); }
function createDeck(name, cards) {
  const id = String(Date.now());
  let cid = 0;
  store.decks[id] = { name, next: cards.length, created: Date.now(),
    cards: cards.map(c => ({ cid: cid++, h: c.h, p: c.p, e: c.e })) };
  save();
  toast(`"${name}" created with ${cards.length} cards ✓`);
  go("cdeck:" + id);
}
async function renderCDeck(deckId) {
  const d = store.decks[deckId];
  if (!d) return goHome();
  const words = d.cards.map(c => deckWord(deckId, c));
  const vis = visWords(words);
  const pct = SRS.pct(vis.map(cardOf));
  const due = vis.filter(w => SRS.isDue(cardOf(w))).length;
  app.innerHTML = `
    ${topbar(d.name)}
    <div class="card">
      <div class="muted">${vis.length} words${words.length - vis.length ? ` · ${words.length - vis.length} hidden` : ""} · ${due} due</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" data-go="quiz:flip:c${deckId}">Study</button>
        <button class="btn" data-go="quiz:choice:c${deckId}">Multiple choice</button>
        <label class="weaktoggle"><input type="checkbox" id="weakest" ${store.settings.weakest ? "checked" : ""}> Weakest first</label>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost" id="addmore">➕ Add cards</button>
        <button class="btn ghost" id="renamedeck">Rename</button>
        <button class="btn ghost" id="deldeck" style="border-color:var(--accent-soft);color:var(--accent)">Delete deck</button>
      </div>
    </div>
    <div class="card"><div class="section-title" style="margin-top:0">Words</div><div id="words"></div></div>`;
  const box = document.getElementById("words");
  box.innerHTML = words.map(wordRow).join("") || '<div class="empty">No cards — add some below.</div>';
  document.getElementById("weakest").onchange = e => { store.settings.weakest = e.target.checked; save(); };
  document.getElementById("addmore").onclick = () => {
    const text = prompt("Paste CSV rows (english,chinese,pinyin) to append:");
    if (!text) return;
    const cards = parseCSV(text);
    if (!cards.length) return toast("Couldn't read any rows");
    let cid = d.next;
    for (const c of cards) d.cards.push({ cid: cid++, h: c.h, p: c.p, e: c.e });
    d.next = cid;
    save();
    toast(`Added ${cards.length} cards ✓`);
    renderCDeck(deckId);
  };
  document.getElementById("renamedeck").onclick = () => {
    const name = prompt("Deck name:", d.name);
    if (name && name.trim()) { d.name = name.trim(); save(); renderCDeck(deckId); }
  };
  document.getElementById("deldeck").onclick = () => {
    if (!confirm(`Delete deck "${d.name}" and its progress?`)) return;
    delete store.decks[deckId];
    for (const k of Object.keys(store.cards)) if (k.startsWith("c" + deckId + ":")) delete store.cards[k];
    save();
    toast("Deck deleted");
    goHome();
  };
}

/* ---------------- domain packs ---------------- */
async function renderDomain(key) {
  const meta = await loadDomainMeta();
  const unlocked = await unlockedHsk();
  let words = [];
  for (const l of unlocked) {
    const lv = await loadLevel(l);
    words.push(...lv.filter(w => w.d === key));
  }
  words.sort((a, b) => a.l - b.l || a.id - b.id);
  words = kWords(words);
  if (lang() === "yue") await loadJyut();
  const cards = levelCards(words);
  app.innerHTML = `
    ${topbar(meta.labels[key])}
    <div class="card">
      <div class="muted">${visWords(words).length} words · ${SRS.pct(cards)}% mastered</div>
      <div class="row" style="margin-top:12px">
        <button class="btn gold" data-go="quiz:flip:D${key}">Study</button>
        <button class="btn" data-go="quiz:choice:D${key}">Multiple choice</button>
      </div>
    </div>
    <div class="card"><div id="words">${words.slice(0, 60).map(wordRow).join("")}</div></div>`;
}

/* ---------------- quiz ---------------- */
let session = null;
function weakestSort(a, b) {
  const ca = cardOf(a.w), cb = cardOf(b.w);
  return (cb.lp - ca.lp) || (ca.i - cb.i) || (ca.e - cb.e);
}
async function startQuiz(kind, target) {
  // target: "<n>" = HSK level, "t<n>" = Cantonese tier, "D<key>" = domain,
  // "c<deckId>" = custom deck, "review" = everything unlocked in this language
  let pool = [], label, srcPool = [];
  const L = lang();
  if (target === "review") {
    const k = L === "yue" ? "y" : "z";
    const unlocked = await unlockedHsk();
    for (const l of unlocked) srcPool.push(...(await loadLevel(l)).map(w => ({ ...w, _k: k })));
    if (L === "yue") {
      for (const t of await unlockedTiers()) srcPool.push(...await loadYue(t));
      label = "Review all · 粵";
    } else label = "Review all";
    for (const [deckId, d] of Object.entries(store.decks)) srcPool.push(...d.cards.map(c => deckWord(deckId, c)));
  } else if (target.startsWith("D")) {
    const key = target.slice(1);
    const unlocked = await unlockedHsk();
    const meta = await loadDomainMeta();
    for (const l of unlocked) srcPool.push(...(await loadLevel(l)).filter(w => w.d === key).map(w => ({ ...w, _k: L === "yue" ? "y" : "z" })));
    label = meta.labels[key];
  } else if (target.startsWith("t")) {
    srcPool = await loadYue(+target.slice(1));
    label = TIER_NAMES[+target.slice(1)];
  } else if (target.startsWith("c")) {
    const d = store.decks[target.slice(1)];
    if (!d) return goHome();
    srcPool = d.cards.map(c => deckWord(target.slice(1), c));
    label = d.name;
  } else {
    const l = +target;
    srcPool = (await loadLevel(l)).map(w => ({ ...w, _k: L === "yue" ? "y" : "z" }));
    label = LEVEL_NAMES[l];
  }
  if (L === "yue") await loadJyut();
  srcPool = visWords(srcPool);
  pool = srcPool;

  const histToday = store.hist[todayKey()] || { r: 0, c: 0, n: 0 };
  let newAllow = Math.max(0, store.settings.dailyNew - histToday.n);
  const due = [], fresh = [];
  for (const w of pool) {
    const c = cardOf(w);
    if (SRS.isDue(c)) due.push({ w, isNew: false });
    else if (c.r === 0) fresh.push({ w, isNew: true });
  }
  if (store.settings.weakest) due.sort(weakestSort);
  else due.sort((a, b) => cardOf(a.w).d - cardOf(b.w).d);
  const picks = due.slice(0, store.settings.sessionLen);
  for (const f of fresh) {
    if (picks.length >= store.settings.sessionLen) break;
    if (newAllow <= 0) break;
    picks.push(f); newAllow--;
  }
  if (!picks.length) {
    toast(histToday.n >= store.settings.dailyNew
      ? "Daily new-card limit reached — review due cards tomorrow 🌙"
      : "Nothing due here right now 🌙");
    return;
  }
  session = { kind, picks, i: 0, right: 0, wrong: 0, label, lastTarget: target, srcPool: pool };
  go("quiz");
}
async function renderQuiz() {
  const s = session;
  if (!s || s.i >= s.picks.length) return renderSummary();
  const { w, isNew } = s.picks[s.i];
  const e = effWord(w);
  const card = cardOf(w);
  const hanziFront = !store.settings.reverse;
  const front = hanziFront ? e.h : e.e[0];
  const r = rom(w);

  app.innerHTML = `
    ${topbar(s.label)}
    <div class="quiz-top">
      <button class="iconbtn" data-quit="1" title="End session">✕</button>
      <div class="count">${s.i + 1} / ${s.picks.length}</div>
      <span style="width:38px"></span>
    </div>
    ${s.kind === "flip" ? `
    <div class="quiz-card" id="card" data-reveal="0">
      <div class="hz">${esc(front)}</div>
      <div class="hint" id="hint">tap to reveal</div>
      <div class="hz" id="answer" style="display:none;font-size:40px">${esc(e.h)}</div>
      <div class="py" id="py" style="display:none">${esc(r)}</div>
      <div class="en" id="en" style="display:none">${esc(e.e.join("; "))}</div>
      <div style="margin-top:14px;display:none" id="speakwrap">${speakBtn(e.h)}</div>
    </div>
    <div class="grades" id="grades" style="visibility:hidden">
      <button class="btn g-again" data-grade="0">Again<small>10 min</small></button>
      <button class="btn g-hard" data-grade="1">Hard<small>${nextIv(card, 1)}</small></button>
      <button class="btn g-good" data-grade="2">Good<small>${nextIv(card, 2)}</small></button>
      <button class="btn g-easy" data-grade="3">Easy<small>${nextIv(card, 3)}</small></button>
    </div>` : `
    <div class="quiz-card" style="cursor:default">
      <div class="hz">${esc(e.h)}</div>
      <div class="py">${esc(r)}</div>
      <div style="margin-top:12px">${speakBtn(e.h)}</div>
    </div>
    <div class="choices" id="choices"></div>`}
    ${w._k === "y" && !JYUT[w.id] ? '<div class="faint" style="text-align:center;margin-top:8px">no jyutping on file — pinyin shown</div>' : ""}
    ${session.picks[s.i].isNew ? '<div class="faint" style="text-align:center;margin-top:8px">new card</div>' : ""}`;

  if (s.kind === "flip") {
    const el = document.getElementById("card");
    el.onclick = () => {
      if (el.dataset.reveal === "1") return;
      el.dataset.reveal = "1";
      if (!hanziFront) document.getElementById("answer").style.display = "";
      document.getElementById("py").style.display = "";
      document.getElementById("en").style.display = "";
      document.getElementById("speakwrap").style.display = "";
      document.getElementById("hint").style.display = "none";
      document.getElementById("grades").style.visibility = "visible";
      if (hanziFront) TTS.speak(e.h, store.settings.rate, lang());
    };
    document.getElementById("grades").onclick = ev => {
      const b = ev.target.closest("[data-grade]");
      if (!b) return;
      gradeFlip(+b.dataset.grade, w, s.picks[s.i].isNew);
    };
  } else renderChoice(w, s.picks[s.i].isNew);
}
function nextIv(card, g) {
  const c = SRS.grade(card, g);
  return c.i === 0 ? "10 min" : (c.i >= 30 ? Math.round(c.i / 7) + "w" : c.i + "d");
}
function gradeFlip(g, w, isNew) {
  const key = cardKey(w);
  store.cards[key] = SRS.grade(cardOf(w), g);
  const correct = g >= 2;
  if (correct) session.right++; else session.wrong++;
  record(correct, isNew);
  session.i++;
  renderQuiz();
}
function renderChoice(w, isNew) {
  const box = document.getElementById("choices");
  const others = [];
  let guard = 200;
  while (others.length < 3 && guard-- > 0) {
    const c = session.srcPool[Math.floor(Math.random() * session.srcPool.length)];
    if (c && cardKey(c) !== cardKey(w) && !others.find(o => cardKey(o) === cardKey(c)) && effWord(c).e[0] !== effWord(w).e[0]) others.push(c);
  }
  const opts = [...others.map(o => effWord(o).e[0]), effWord(w).e[0]].sort(() => Math.random() - 0.5);
  box.innerHTML = opts.map(o => `<button class="choice">${esc(o)}</button>`).join("");
  box.onclick = ev => {
    const b = ev.target.closest(".choice");
    if (!b || box.dataset.done) return;
    box.dataset.done = "1";
    const answer = effWord(w).e[0];
    const correct = b.textContent === answer;
    b.classList.add(correct ? "correct" : "wrong");
    if (!correct) [...box.children].find(x => x.textContent === answer).classList.add("correct");
    store.cards[cardKey(w)] = SRS.grade(cardOf(w), correct ? 2 : 0);
    if (correct) session.right++; else session.wrong++;
    record(correct, isNew);
    TTS.speak(effWord(w).h, store.settings.rate, lang());
    setTimeout(() => { session.i++; renderQuiz(); }, 850);
  };
}
async function renderSummary() {
  const s = session; if (!s) return goHome();
  const total = s.right + s.wrong;
  const acc = total ? Math.round(100 * s.right / total) : 0;
  app.innerHTML = `
    ${topbar("Session done")}
    <div class="quiz-card" style="cursor:default">
      <div style="font-size:40px">${acc >= 80 ? "🎉" : acc >= 50 ? "👍" : "💪"}</div>
      <div class="hz" style="font-size:26px;margin-top:10px">${s.right} right · ${s.wrong} wrong</div>
      <div class="muted" style="margin-top:6px">${acc}% accuracy — ${esc(s.label)}</div>
    </div>
    <div class="row">
      <button class="btn primary" data-again="1">Study more</button>
      <button class="btn" data-go="home">Home</button>
    </div>`;
  document.querySelector("[data-again]").onclick = () => startQuiz(session.kind, session.lastTarget || "review");
}

/* ---------------- card editor ---------------- */
let editCtx = null;   // {w} — set before navigating to "edit"
async function renderEdit() {
  const w = editCtx && editCtx.w;
  if (!w) return back();
  const e = effWord(w);
  const key = cardKey(w);
  const card = cardOf(w);
  const isCustom = w._k.startsWith("c");
  const grades = ["again", "hard", "good", "easy"];
  const histHtml = (card.h || []).slice().reverse().map(hh => {
    const d = new Date(hh.t);
    return `<div class="histrow"><span>${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</span><span class="g-${hh.g}">${grades[hh.g]}</span></div>`;
  }).join("") || '<div class="faint">No reviews yet.</div>';
  app.innerHTML = `
    ${topbar("Edit card")}
    <div class="card">
      <div class="section-title" style="margin-top:0">${isCustom ? "Custom deck card" : "Stored word"} · <span class="hz">${esc(e.h)}</span></div>
      <div class="set-row"><label>汉字 / 漢字</label><input id="eh" value="${esc(e.h)}"></div>
      <div class="set-row"><label>${lang() === "yue" ? "Jyutping" : "Pinyin"}${w._k === "y" ? " (blank = words.hk jyutping)" : ""}</label><input id="ep" value="${esc(w._k === "y" ? (JYUT[w.id] || "") : e.p)}"></div>
      <div class="set-row"><label>English <span class="muted">(separate with ;)</span></label><input id="ee" value="${esc(e.e.join("; "))}"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="esave">Save</button>
        <button class="btn" id="ehide">${isHidden(w) ? "Unhide" : "Hide card"}</button>
        ${isCustom ? '<button class="btn ghost" id="edel" style="border-color:var(--accent-soft);color:var(--accent)">Delete card</button>' : ""}
      </div>
      ${!isCustom ? '<p class="faint" style="margin-top:10px">Edits are stored as your personal override — the built-in data stays untouched.</p>' : ""}
    </div>
    <div class="card"><div class="section-title" style="margin-top:0">History</div><div class="hist">${histHtml}</div></div>`;
  document.getElementById("esave").onclick = () => {
    const h = document.getElementById("eh").value.trim();
    const p = document.getElementById("ep").value.trim();
    const ee = document.getElementById("ee").value.split(";").map(x => x.trim()).filter(Boolean);
    if (!h || !ee.length) return toast("Hanzi and English can't be empty");
    if (isCustom) {
      const deckId = w._k.slice(1);
      const entry = store.decks[deckId].cards.find(c => c.cid === w.id);
      entry.h = h; entry.p = p; entry.e = ee;
    } else {
      const c = store.cards[key] || (store.cards[key] = SRS.newCard());
      c.o = { h, p, e: ee };
    }
    save();
    toast("Saved ✓");
    back();
  };
  document.getElementById("ehide").onclick = () => {
    if (isHidden(w)) delete store.hidden[key];
    else store.hidden[key] = 1;
    save();
    toast(isHidden(w) ? "Card unhidden" : "Card hidden — it won't appear in quizzes or counts");
    back();
  };
  const del = document.getElementById("edel");
  if (del) del.onclick = () => {
    const deckId = w._k.slice(1);
    const d = store.decks[deckId];
    d.cards = d.cards.filter(c => c.cid !== w.id);
    delete store.cards[key];
    save();
    toast("Card deleted");
    back();
  };
}
async function buildIndex() {
  if (INDEX) return INDEX;
  INDEX = {};
  for (let l = 1; l <= 6; l++) for (const w of await loadLevel(l)) {
    INDEX["z:" + w.id] = w;
    INDEX["y:" + w.id] = { ...w, _k: "y" };
  }
  for (let t = 1; t <= 3; t++) for (const w of await loadYue(t)) INDEX["s:" + w.id] = w;
  for (const [deckId, d] of Object.entries(store.decks))
    for (const c of d.cards) INDEX["c" + deckId + ":" + c.cid] = deckWord(deckId, c);
  return INDEX;
}

/* ---------------- stats ---------------- */
async function renderStats(range = 14) {
  const L = lang();
  const unlocked = await unlockedHsk();
  const k = L === "yue" ? "y" : "z";
  if (L === "yue") await loadJyut();
  let totalWords = 0, mastered = 0, chars = new Set(), learnedChars = new Set();
  const countWords = words => {
    for (const w of visWords(words)) {
      totalWords++;
      const e = effWord(w);
      for (const ch of e.h) {
        chars.add(ch);
        if (cardOf(w).r > 0) learnedChars.add(ch);
      }
    }
    mastered += levelCards(words).filter(c => SRS.isMastered(c)).length;
  };
  for (const l of unlocked) countWords(kWords(await loadLevel(l)));
  if (L === "yue") for (const t of await unlockedTiers()) countWords(await loadYue(t));
  for (const [deckId, d] of Object.entries(store.decks))
    countWords(d.cards.map(c => deckWord(deckId, c)));

  const days = [];
  for (let i = range - 1; i >= 0; i--) {
    const k = dayKeyOffset(i);
    const h = store.hist[k];
    days.push({ k, r: h ? h.r : 0, c: h ? h.c : 0 });
  }
  const maxR = Math.max(...days.map(d => d.r), 1);
  const last30 = { r: 0, c: 0 };
  for (let i = 0; i < 30; i++) { const h = store.hist[dayKeyOffset(i)]; if (h) { last30.r += h.r; last30.c += h.c; } }
  const ret = last30.r ? Math.round(100 * last30.c / last30.r) : 0;

  app.innerHTML = `
    ${topbar("Progress")}
    <div class="stat-grid">
      <div class="stat"><b>🔥 ${streak()}</b><span>day streak</span></div>
      <div class="stat"><b>${mastered}</b><span>words mastered</span></div>
      <div class="stat"><b>${learnedChars.size}</b><span>characters seen</span></div>
      <div class="stat"><b>${ret}%</b><span>30-day accuracy</span></div>
    </div>
    <div class="section-title">Reviews <span class="ranges">
      ${[14, 30, 90].map(r => `<button class="range ${r === range ? "on" : ""}" data-range="${r}">${r}d</button>`).join("")}</span></div>
    <div class="card"><div class="chart">
      ${days.map(d => `<div class="col"><i style="height:${Math.round(100 * d.r / maxR)}%" title="${d.k}: ${d.r}"></i><span>${d.k.slice(8)}</span></div>`).join("")}
    </div></div>
    <div class="section-title">Vocabulary</div>
    <div class="card">
      <div class="set-row"><label>Words unlocked</label><span class="muted">${totalWords}</span></div>
      <div class="set-row"><label>Unique characters available</label><span class="muted">${chars.size}</span></div>
      <div class="set-row"><label>Total reviews ever</label><span class="muted">${Object.values(store.hist).reduce((s, h) => s + h.r, 0)}</span></div>
    </div>`;
  app.querySelectorAll("[data-range]").forEach(b => b.onclick = () => renderStats(+b.dataset.range));
}

/* ---------------- search ---------------- */
async function renderSearch() {
  const L = lang();
  const unlocked = await unlockedHsk();
  app.innerHTML = `
    ${topbar("Search")}
    <input class="search" id="q" placeholder="English, ${L === "yue" ? "jyutping" : "pinyin"} or 汉字…" autocomplete="off">
    <div id="results" class="card" style="display:none"></div>
    <div class="empty" id="placeholder"><div class="big">🔍</div>Search your unlocked decks</div>`;
  const input = document.getElementById("q"), box = document.getElementById("results");
  if (L === "yue") await loadJyut();
  let words = [];
  for (const l of unlocked) words.push(...(await loadLevel(l)).map(w => ({ ...w, _k: L === "yue" ? "y" : "z" })));
  if (L === "yue") for (const t of await unlockedTiers()) words.push(...await loadYue(t));
  for (const [deckId, d] of Object.entries(store.decks)) words.push(...d.cards.map(c => deckWord(deckId, c)));
  words = visWords(words);
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { box.style.display = "none"; document.getElementById("placeholder").style.display = ""; return; }
    const hits = words.filter(w => {
      const e = effWord(w);
      return rom(w).toLowerCase().replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
        e.h.includes(input.value.trim()) ||
        e.e.some(x => x.toLowerCase().includes(q));
    }).slice(0, 50);
    document.getElementById("placeholder").style.display = "none";
    box.style.display = "";
    box.innerHTML = hits.length ? hits.map(wordRow).join("") : '<div class="empty">No matches</div>';
  };
}

/* ---------------- hidden cards ---------------- */
async function renderHidden() {
  await buildIndex();
  const keys = Object.keys(store.hidden);
  app.innerHTML = `
    ${topbar("Hidden cards")}
    <div class="card">
      ${keys.length ? keys.map(k => {
        const w = INDEX[k];
        return `<div class="word"><span class="hz">${w ? esc(effWord(w).h) : "?"}</span>
          <span class="py">${w ? esc(rom(w)) : ""}</span>
          <span class="en">${w ? esc(effWord(w).e.join("; ")) : esc(k)}</span>
          <button class="btn ghost" data-unhide="${esc(k)}">Unhide</button></div>`;
      }).join("") : '<div class="empty">Nothing hidden.</div>'}
    </div>`;
  app.querySelectorAll("[data-unhide]").forEach(b => b.onclick = () => {
    delete store.hidden[b.dataset.unhide];
    save();
    renderHidden();
  });
}

/* ---------------- settings ---------------- */
function renderSettings() {
  const s = store.settings;
  document.documentElement.dataset.theme = s.theme === "auto" ? "" : s.theme;
  if (s.theme === "auto") document.documentElement.removeAttribute("data-theme");
  app.innerHTML = `
    ${topbar("Settings")}
    <div class="card">
      <div class="section-title" style="margin-top:0">Study</div>
      <div class="set-row"><label>Daily new cards</label><input type="number" id="dailyNew" min="0" max="100" value="${s.dailyNew}"></div>
      <div class="set-row"><label>Cards per session</label><input type="number" id="sessionLen" min="5" max="60" value="${s.sessionLen}"></div>
      <div class="set-row"><label>Reverse mode<br><span class="muted">English on the front</span></label>
        <select id="reverse"><option value="0" ${!s.reverse ? "selected" : ""}>Off</option><option value="1" ${s.reverse ? "selected" : ""}>On</option></select></div>
      <div class="set-row"><label>Weakest first<br><span class="muted">Quiz your leakiest cards first</span></label>
        <select id="weakest"><option value="0" ${!s.weakest ? "selected" : ""}>Off</option><option value="1" ${s.weakest ? "selected" : ""}>On</option></select></div>
      <div class="section-title">Language</div>
      <div class="set-row"><label>Study mode<br><span class="muted">普通话 or 廣東話 — progress is tracked separately</span></label>
        <select id="lang"><option value="zh" ${s.lang === "zh" ? "selected" : ""}>普通话 Mandarin</option><option value="yue" ${s.lang === "yue" ? "selected" : ""}>廣東話 Cantonese</option></select></div>
      <div class="section-title">Audio & theme</div>
      <div class="set-row"><label>Speech speed</label>
        <select id="rate"><option value="0.6" ${s.rate == 0.6 ? "selected" : ""}>Slow</option><option value="0.9" ${s.rate == 0.9 ? "selected" : ""}>Normal</option><option value="1.2" ${s.rate == 1.2 ? "selected" : ""}>Fast</option></select></div>
      <div class="set-row"><label>Theme</label>
        <select id="theme"><option value="auto" ${s.theme === "auto" ? "selected" : ""}>Auto</option><option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${s.theme === "dark" ? "selected" : ""}>Dark</option></select></div>
    </div>
    <div class="card">
      <div class="section-title" style="margin-top:0">Cards <span class="muted" style="text-transform:none">— hidden & edited words</span></div>
      <div class="row">
        <button class="btn" id="hiddenbtn">🙈 Hidden cards (${Object.keys(store.hidden).length})</button>
      </div>
    </div>
    <div class="card">
      <div class="section-title" style="margin-top:0">Data <span class="muted" style="text-transform:none">— lives in this browser only</span></div>
      <div class="row">
        <button class="btn" id="export">⬇️ Export backup</button>
        <button class="btn" id="import">⬆️ Import backup</button>
      </div>
      <input type="file" id="file" accept="application/json" style="display:none">
      <p class="faint" style="margin-top:10px">Export regularly — iOS can clear website storage after weeks of not opening the app. Backups merge with your current progress.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="installbtn" style="display:none">📲 Install app</button>
        <button class="btn ghost" id="reset" style="border-color:var(--accent-soft);color:var(--accent)">Reset all progress</button>
      </div>
    </div>`;
  const bind = (id, key, cast = v => v) => {
    document.getElementById(id).onchange = e => { store.settings[key] = cast(e.target.value); save(); };
  };
  bind("dailyNew", "dailyNew", v => +v);
  bind("sessionLen", "sessionLen", v => +v);
  bind("reverse", "reverse", v => v === "1");
  bind("weakest", "weakest", v => v === "1");
  bind("lang", "lang");
  bind("rate", "rate", v => +v);
  bind("theme", "theme");
  document.getElementById("hiddenbtn").onclick = () => go("hidden");
  document.getElementById("export").onclick = () => {
    const blob = new Blob([JSON.stringify(store)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hanpath-backup-" + todayKey() + ".json";
    a.click();
  };
  document.getElementById("import").onclick = () => document.getElementById("file").click();
  document.getElementById("file").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = migrateState(JSON.parse(r.result));
        if (!data.cards) throw 0;
        // merge: keep the "stronger" version of each card
        for (const [id, c] of Object.entries(data.cards)) {
          const mine = store.cards[id];
          if (!mine || (c.i || 0) >= (mine.i || 0)) store.cards[id] = c;
        }
        for (const [k, h] of Object.entries(data.hist || {})) {
          const mine = store.hist[k];
          if (!mine) store.hist[k] = h;
          else store.hist[k] = { r: mine.r + h.r, c: mine.c + h.c, n: mine.n + h.n };
        }
        for (const [id, d] of Object.entries(data.decks || {}))
          if (!store.decks[id]) store.decks[id] = d;
        for (const [k, v] of Object.entries(data.hidden || {})) store.hidden[k] = v;
        if (data.settings) store.settings = Object.assign(store.settings, data.settings);
        save();
        toast("Backup imported ✓");
      } catch (err) { toast("That file didn't look like a Hanpath backup"); }
    };
    r.readAsText(f);
  };
  document.getElementById("reset").onclick = () => {
    if (confirm("Delete ALL progress in this browser? A backup first is wise.")) {
      store = defaultState(); save(); toast("Progress reset");
      renderSettings();
    }
  };
  if (window._installEvt) {
    const b = document.getElementById("installbtn");
    b.style.display = "";
    b.onclick = () => { window._installEvt.prompt(); window._installEvt = null; b.style.display = "none"; };
  }
}

/* ---------------- router wiring ---------------- */
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g) {
    const v = g.dataset.go;
    if (v === "home") goHome();
    else if (v === "review") startQuiz("flip", "review");
    else if (v === "mydecks") go("mydecks");
    else if (v === "search") go("search");
    else if (v === "stats") go("stats");
    else if (v === "settings") go("settings");
    else if (v.startsWith("quiz:")) { const [, kind, target] = v.split(":"); startQuiz(kind, target); }
    return;
  }
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    buildIndex().then(() => {
      const w = INDEX[ed.dataset.edit];
      if (w) { editCtx = { w }; go("edit"); }
    });
    return;
  }
  const d = e.target.closest("[data-level]");
  if (d) go("deck:" + d.dataset.level);
  const t = e.target.closest("[data-tier]");
  if (t) go("deck:t" + t.dataset.tier);
  const cd = e.target.closest("[data-cdeck]");
  if (cd) go("cdeck:" + cd.dataset.cdeck);
  const dm = e.target.closest("[data-domain]");
  if (dm) go("domain:" + dm.dataset.domain);
  if (e.target.closest("[data-quit]")) { session = null; back(); }
});

function goHome() { nav = ["home"]; renderHome(); }
async function render(view) {
  try {
    if (view === "home") await renderHome();
    else if (view.startsWith("deck:")) await renderDeck(view.slice(5));
    else if (view.startsWith("cdeck:")) await renderCDeck(view.slice(6));
    else if (view.startsWith("domain:")) await renderDomain(view.slice(7));
    else if (view === "mydecks") await renderMyDecks();
    else if (view === "quiz") await renderQuiz();
    else if (view === "edit") await renderEdit();
    else if (view === "hidden") await renderHidden();
    else if (view === "stats") await renderStats();
    else if (view === "search") renderSearch();
    else if (view === "settings") renderSettings();
  } catch (err) {
    app.innerHTML = `<div class="empty"><div class="big">😵</div>Something broke: ${esc(err.message || err)}</div>`;
    console.error(err);
  }
}

/* ---------------- PWA ---------------- */
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window._installEvt = e; });
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
goHome();