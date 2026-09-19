/* Hanpath — Mandarin flashcards. Vanilla JS, no build step. */
"use strict";

/* ---------------- constants & state ---------------- */
const LEVEL_NAMES = { 1: "HSK 1", 2: "HSK 2", 3: "HSK 3", 4: "HSK 4", 5: "HSK 5", 6: "HSK 6" };
const LEVEL_GLYPH = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" };
const DOMAIN_GLYPH = { food: "🍜", travel: "🧳", transport: "🚌", family: "👨‍👩‍👧", people: "🧑‍🏫", time: "🕐", numbers: "🔢", places: "🏙️", body: "🩺", weather: "🌤️", nature: "⛰️", work: "💼", money: "🛍️", tech: "💻", clothes: "👕", feelings: "💗" };
const KEY = "hanpath.v1";
const DATA = {};          // level -> word array (lazy loaded)
let DOMAIN_META = null;   // {labels, counts}

function defaultState() {
  return {
    cards: {},       // id -> {e,i,r,lp,d}
    hist: {},        // 'YYYY-MM-DD' -> {r: reviews, c: correct, n: newCards}
    settings: { dailyNew: 10, sessionLen: 15, rate: 0.9, reverse: false, theme: "auto" },
  };
}
let store = defaultState();
try {
  const saved = localStorage.getItem(KEY);
  if (saved) store = Object.assign(defaultState(), JSON.parse(saved));
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
  // count consecutive study days ending today (or yesterday if today not started)
  const start = (store.hist[todayKey()] || {}).r ? 0 : 1;
  let s = 0;
  for (let i = start; i < 3650; i++) {
    const h = store.hist[dayKeyOffset(i)];
    if (h && h.r > 0) s++; else break;
  }
  return s;
}

/* ---------------- data loading ---------------- */
async function loadLevel(l) {
  if (DATA[l]) return DATA[l];
  const res = await fetch("data/hsk" + l + ".json");
  DATA[l] = await res.json();
  return DATA[l];
}
async function loadDomainMeta() {
  if (DOMAIN_META) return DOMAIN_META;
  DOMAIN_META = await (await fetch("data/domains.json")).json();
  return DOMAIN_META;
}
function cardOf(id) { return store.cards[id] || SRS.newCard(); }
function levelCards(words) { return words.map(w => cardOf(w.id)); }
async function levelMastery(l) {
  const words = await loadLevel(l);
  return SRS.pct(levelCards(words));
}
function isUnlocked(levels, l) { // levels = Set of already-known mastery, filled by caller
  return l === 1 || (levels.get(l - 1) || 0) >= SRS.UNLOCK_PCT;
}
async function masteryMap() {
  const m = new Map();
  for (let l = 1; l <= 6; l++) m.set(l, await levelMastery(l));
  return m;
}
async function unlockedLevels() {
  const m = await masteryMap();
  const out = [];
  for (let l = 1; l <= 6; l++) if (isUnlocked(m, l)) out.push(l); else break;
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
document.addEventListener("click", e => {
  const b = e.target.closest("[data-speak]");
  if (b) { e.stopPropagation(); TTS.speak(b.dataset.speak, store.settings.rate); }
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
  const unlocked = await unlockedLevels();
  const m = await masteryMap();
  const domainMeta = await loadDomainMeta();

  const dueCounts = { due: 0, new: 0 };
  const histToday = store.hist[todayKey()] || { r: 0, c: 0, n: 0 };
  const newAllow = Math.max(0, store.settings.dailyNew - histToday.n);

  for (const l of unlocked) {
    const words = await loadLevel(l);
    for (const w of words) {
      const c = cardOf(w.id);
      if (SRS.isDue(c)) dueCounts.due++;
      else if (c.r === 0 && newAllow > 0) { dueCounts.new++; newAllow--; }
    }
  }
  const total = dueCounts.due + dueCounts.new;
  const st = streak();

  let decksHtml = "";
  for (let l = 1; l <= 6; l++) {
    const unlockedL = unlocked.includes(l);
    const words = unlockedL ? await loadLevel(l) : null;
    const totalW = words ? words.length : (await countWords(l));
    decksHtml += `
      <button class="deck ${unlockedL ? "" : "locked"}" data-level="${l}">
        <div class="glyph">${LEVEL_GLYPH[l]}</div>
        <div class="info">
          <div class="name">${LEVEL_NAMES[l]} <span class="faint">· ${totalW} words</span></div>
          <div class="bar"><i style="width:${m.get(l)}%"></i></div>
        </div>
        <div class="pct">${unlockedL ? m.get(l) + "%" : "🔒"}</div>
      </button>`;
  }

  let domainsHtml = "";
  for (const [key, counts] of Object.entries(domainMeta.counts)) {
    const avail = Object.entries(counts).filter(([l]) => unlocked.includes(+l));
    const n = avail.reduce((s, [, c]) => s + c, 0);
    if (n < 12) continue;
    domainsHtml += `
      <button class="deck gold" data-domain="${key}">
        <div class="glyph">${DOMAIN_GLYPH[key] || "📚"}</div>
        <div class="info"><div class="name">${esc(domainMeta.labels[key])}</div>
        <div class="sub">${n} words from your unlocked levels</div></div>
      </button>`;
  }

  app.innerHTML = `
    <div class="topbar"><h1>Hanpath</h1><button class="iconbtn" data-go="search" title="Search">🔍</button><button class="iconbtn" data-go="stats" title="Stats">📊</button><button class="iconbtn" data-go="settings" title="Settings">⚙️</button></div>
    <div class="hero">
      <div class="label">${greeting()}</div>
      <div class="due">${total}</div>
      <div class="label">cards ready ${histToday.r ? "· " + histToday.r + " reviewed today" : ""}</div>
      <div class="streak">🔥 ${st}-day streak</div>
      ${total ? `<button class="btn block" data-go="review">Start studying →</button>` : `<div class="muted" style="opacity:.85">Come back later — spaced repetition needs time to work. ✨</div>`}
    </div>
    <div class="section-title">HSK path · ${SRS.UNLOCK_PCT}% mastery unlocks the next level</div>
    ${decksHtml}
    <div class="section-title">Domain packs</div>
    ${domainsHtml || '<div class="muted">Unlock HSK levels to open domain packs.</div>'}`;
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "早上好 — good morning" : h < 18 ? "下午好 — good afternoon" : "晚上好 — good evening";
}
async function countWords(l) {
  try { const words = await loadLevel(l); return words.length; }
  catch (e) { return 0; }
}

/* ---------------- deck detail ---------------- */
async function renderDeck(l) {
  const words = await loadLevel(l);
  const cards = levelCards(words);
  const pct = SRS.pct(cards);
  const due = cards.filter(c => SRS.isDue(c)).length;
  const mastered = cards.filter(c => SRS.isMastered(c)).length;
  const SHOW = 60;
  app.innerHTML = `
    ${topbar(LEVEL_NAMES[l])}
    <div class="card">
      <div class="muted">${words.length} words · ${mastered} mastered · ${due} due</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="faint" style="margin-top:6px">${pct}% mastered (interval ≥ ${SRS.MASTERED_DAYS} days)</div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" data-go="quiz:flip:${l}">Study</button>
        <button class="btn" data-go="quiz:choice:${l}">Multiple choice</button>
      </div>
    </div>
    <div class="card"><div class="section-title" style="margin-top:0">Words</div><div id="words"></div>
      <button class="btn ghost block" id="more" style="margin-top:10px">Show more</button></div>`;
  let shown = 0;
  const box = document.getElementById("words");
  function chunk() {
    const slice = words.slice(shown, shown + SHOW);
    box.insertAdjacentHTML("beforeend", slice.map(w => `
      <div class="word">
        <span class="hz">${esc(w.h)}</span>${speakBtn(w.h)}
        <span class="py">${esc(w.p)}</span>
        <span class="en">${esc(w.e.join("; "))}</span>
        ${chipFor(cardOf(w.id))}
      </div>`).join(""));
    shown += slice.length;
    if (shown >= words.length) document.getElementById("more").style.display = "none";
  }
  chunk();
  document.getElementById("more").onclick = chunk;
}

/* ---------------- domain packs ---------------- */
async function renderDomain(key) {
  const meta = await loadDomainMeta();
  const unlocked = await unlockedLevels();
  const idMap = await domainWordIds(key, unlocked);
  let words = [];
  for (const [l, ids] of Object.entries(idMap)) {
    const lv = await loadLevel(+l);
    for (const id of ids) { const w = lv.find(x => x.id === id); if (w) words.push(w); }
  }
  words.sort((a, b) => a.l - b.l || a.id - b.id);
  const cards = levelCards(words);
  app.innerHTML = `
    ${topbar(meta.labels[key])}
    <div class="card">
      <div class="muted">${words.length} words · ${SRS.pct(cards)}% mastered</div>
      <div class="row" style="margin-top:12px">
        <button class="btn gold" data-go="quiz:flip:D${key}">Study</button>
        <button class="btn" data-go="quiz:choice:D${key}">Multiple choice</button>
      </div>
    </div>
    <div class="card"><div id="words">${words.slice(0, 60).map(w => `
      <div class="word"><span class="hz">${esc(w.h)}</span>${speakBtn(w.h)}<span class="py">${esc(w.p)}</span>
      <span class="en">${esc(w.e.join("; "))}</span>${chipFor(cardOf(w.id))}</div>`).join("")}</div></div>`;
}
async function domainWordIds(key, unlocked) {
  const out = {};
  for (const l of unlocked) {
    const words = await loadLevel(l);
    for (const w of words) if (w.d === key) (out[l] = out[l] || []).push(w.id);
  }
  return out;
}

/* ---------------- quiz ---------------- */
let session = null;
async function startQuiz(kind, target) {
  // target: number-as-string = HSK level, "D<key>" = domain pack, "review" = all unlocked
  let pool, label;
  if (target === "review") {
    pool = [];
    for (const l of await unlockedLevels()) pool.push(...await loadLevel(l));
    label = "Review all";
  } else if (typeof target === "string" && target.startsWith("D")) {
    const key = target.slice(1);
    const unlocked = await unlockedLevels();
    const meta = await loadDomainMeta();
    pool = [];
    for (const l of unlocked) {
      const words = await loadLevel(l);
      pool.push(...words.filter(w => w.d === key));
    }
    label = meta.labels[key];
  } else {
    const l = +target;
    pool = await loadLevel(l);
    label = LEVEL_NAMES[l];
  }
  const histToday = store.hist[todayKey()] || { r: 0, c: 0, n: 0 };
  let newAllow = Math.max(0, store.settings.dailyNew - histToday.n);

  const due = [], fresh = [];
  for (const w of pool) {
    const c = cardOf(w.id);
    if (SRS.isDue(c)) due.push({ w, isNew: false });
    else if (c.r === 0) fresh.push({ w, isNew: true });
  }
  due.sort((a, b) => cardOf(a.w.id).d - cardOf(b.w.id).d);
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
  session = { kind, picks, i: 0, right: 0, wrong: 0, label, lastTarget: target };
  go("quiz");
}
async function renderQuiz() {
  const s = session;
  if (!s || s.i >= s.picks.length) return renderSummary();
  const { w, isNew } = s.picks[s.i];
  const card = cardOf(w.id);
  const hanziFront = !store.settings.reverse;
  const front = hanziFront ? w.h : w.e[0];

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
      <div class="hz" id="answer" style="display:none;font-size:40px">${esc(w.h)}</div>
      <div class="py" id="py" style="display:none">${esc(w.p)}</div>
      <div class="en" id="en" style="display:none">${esc(w.e.join("; "))}</div>
      <div style="margin-top:14px;display:none" id="speakwrap">${speakBtn(w.h)}</div>
    </div>
    <div class="grades" id="grades" style="visibility:hidden">
      <button class="btn g-again" data-grade="0">Again<small>10 min</small></button>
      <button class="btn g-hard" data-grade="1">Hard<small>${nextIv(card, 1)}</small></button>
      <button class="btn g-good" data-grade="2">Good<small>${nextIv(card, 2)}</small></button>
      <button class="btn g-easy" data-grade="3">Easy<small>${nextIv(card, 3)}</small></button>
    </div>` : `
    <div class="quiz-card" style="cursor:default">
      <div class="hz">${esc(w.h)}</div>
      <div class="py">${esc(w.p)}</div>
      <div style="margin-top:12px">${speakBtn(w.h)}</div>
    </div>
    <div class="choices" id="choices"></div>`}
    ${isNew ? '<div class="faint" style="text-align:center;margin-top:8px">new card</div>' : ""}`;

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
      if (hanziFront) TTS.speak(w.h, store.settings.rate);
    };
    document.getElementById("grades").onclick = e => {
      const b = e.target.closest("[data-grade]");
      if (!b) return;
      gradeFlip(+b.dataset.grade, w, isNew);
    };
  } else renderChoice(w, isNew);
}
function nextIv(card, g) {
  const c = SRS.grade(card, g);
  return c.i === 0 ? "10 min" : (c.i >= 30 ? Math.round(c.i / 7) + "w" : c.i + "d");
}
function gradeFlip(g, w, isNew) {
  store.cards[w.id] = SRS.grade(cardOf(w.id), g);
  const correct = g >= 2;
  if (correct) session.right++; else session.wrong++;
  record(correct, isNew);
  session.i++;
  renderQuiz();
}
function renderChoice(w, isNew) {
  const box = document.getElementById("choices");
  const others = [];
  const sameLevel = DATA[w.l] || [];
  let guard = 200;
  while (others.length < 3 && guard-- > 0) {
    const c = sameLevel[Math.floor(Math.random() * sameLevel.length)];
    if (c && c.id !== w.id && !others.find(o => o.id === c.id) && c.e[0] !== w.e[0]) others.push(c);
  }
  const opts = [...others.map(o => o.e[0]), w.e[0]].sort(() => Math.random() - 0.5);
  box.innerHTML = opts.map(o => `<button class="choice">${esc(o)}</button>`).join("");
  box.onclick = e => {
    const b = e.target.closest(".choice");
    if (!b || box.dataset.done) return;
    box.dataset.done = "1";
    const correct = b.textContent === w.e[0];
    b.classList.add(correct ? "correct" : "wrong");
    if (!correct) [...box.children].find(x => x.textContent === w.e[0]).classList.add("correct");
    store.cards[w.id] = SRS.grade(cardOf(w.id), correct ? 2 : 0);
    if (correct) session.right++; else session.wrong++;
    record(correct, isNew);
    TTS.speak(w.h, store.settings.rate);
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
      <div class="muted" style="margin-top:6px">${acc}% accuracy — ${s.label}</div>
    </div>
    <div class="row">
      <button class="btn primary" data-again="1">Study more</button>
      <button class="btn" data-go="home">Home</button>
    </div>`;
  document.querySelector("[data-again]").onclick = () => startQuiz(session.kind, session.lastTarget || "review");
}

/* ---------------- stats ---------------- */
async function renderStats() {
  const unlocked = await unlockedLevels();
  let totalWords = 0, mastered = 0, chars = new Set(), learnedChars = new Set();
  for (const l of unlocked) {
    const words = await loadLevel(l);
    totalWords += words.length;
    for (const w of words) {
      for (const ch of w.h) { chars.add(ch); const c = cardOf(w.id); if (c.r > 0) learnedChars.add(ch); }
    }
    mastered += levelCards(words).filter(c => SRS.isMastered(c)).length;
  }
  const days = [];
  for (let i = 13; i >= 0; i--) {
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
    <div class="section-title">Reviews · last 14 days</div>
    <div class="card"><div class="chart">
      ${days.map(d => `<div class="col"><i style="height:${Math.round(100 * d.r / maxR)}%" title="${d.k}: ${d.r}"></i><span>${d.k.slice(8)}</span></div>`).join("")}
    </div></div>
    <div class="section-title">Vocabulary</div>
    <div class="card">
      <div class="set-row"><label>Words unlocked</label><span class="muted">${totalWords}</span></div>
      <div class="set-row"><label>Unique characters available</label><span class="muted">${chars.size}</span></div>
      <div class="set-row"><label>Total reviews ever</label><span class="muted">${Object.values(store.hist).reduce((s, h) => s + h.r, 0)}</span></div>
    </div>`;
}

/* ---------------- search ---------------- */
async function renderSearch() {
  const unlocked = await unlockedLevels();
  app.innerHTML = `
    ${topbar("Search")}
    <input class="search" id="q" placeholder="English, pinyin or 汉字…" autocomplete="off">
    <div id="results" class="card" style="display:none"></div>
    <div class="empty" id="placeholder"><div class="big">🔍</div>Search your unlocked levels<br>(HSK ${unlocked.join(", ") || "1"})</div>`;
  const input = document.getElementById("q"), box = document.getElementById("results");
  let words = [];
  for (const l of unlocked) words.push(...await loadLevel(l));
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { box.style.display = "none"; document.getElementById("placeholder").style.display = ""; return; }
    const hits = words.filter(w =>
      w.p.toLowerCase().replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
      w.h.includes(input.value.trim()) ||
      w.e.some(x => x.toLowerCase().includes(q))
    ).slice(0, 50);
    document.getElementById("placeholder").style.display = "none";
    box.style.display = "";
    box.innerHTML = hits.length ? hits.map(w => `
      <div class="word"><span class="hz">${esc(w.h)}</span>${speakBtn(w.h)}<span class="py">${esc(w.p)}</span>
      <span class="en">${esc(w.e.join("; "))}</span><span class="faint">H${w.l}</span></div>`).join("")
      : '<div class="empty">No matches</div>';
  };
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
      <div class="section-title">Audio & theme</div>
      <div class="set-row"><label>Speech speed</label>
        <select id="rate"><option value="0.6" ${s.rate == 0.6 ? "selected" : ""}>Slow</option><option value="0.9" ${s.rate == 0.9 ? "selected" : ""}>Normal</option><option value="1.2" ${s.rate == 1.2 ? "selected" : ""}>Fast</option></select></div>
      <div class="set-row"><label>Theme</label>
        <select id="theme"><option value="auto" ${s.theme === "auto" ? "selected" : ""}>Auto</option><option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${s.theme === "dark" ? "selected" : ""}>Dark</option></select></div>
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
  bind("rate", "rate", v => +v);
  bind("theme", "theme");
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
        const data = JSON.parse(r.result);
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
    else if (v === "search") go("search");
    else if (v === "stats") go("stats");
    else if (v === "settings") go("settings");
    else if (v.startsWith("quiz:")) { const [, kind, target] = v.split(":"); startQuiz(kind, target === "review" ? "review" : target); }
    return;
  }
  const d = e.target.closest("[data-level]");
  if (d) go("deck:" + d.dataset.level);
  const dm = e.target.closest("[data-domain]");
  if (dm) go("domain:" + dm.dataset.domain);
  if (e.target.closest("[data-quit]")) { session = null; back(); }
});

function goHome() { nav = ["home"]; renderHome(); }
async function render(view) {
  try {
    if (view === "home") await renderHome();
    else if (view.startsWith("deck:")) await renderDeck(+view.slice(5));
    else if (view.startsWith("domain:")) await renderDomain(view.slice(7));
    else if (view === "quiz") await renderQuiz();
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