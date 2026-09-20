#!/usr/bin/env python3
"""Builds the Cantonese side of Hanpath from words.hk open datasets
(https://words.hk/faiman/analysis/, public domain):

1. data/jyutping.json — {hsk_id: jyutping} for the existing 4,989 HSK words
   (word-level lookup, char-level fallback).
2. data/yue1..3.json — ~1,200-word spoken-Cantonese deck in 3 frequency tiers,
   same word shape as the HSK files, ids prefixed "y".

Sources (download to /tmp, paths configurable via env):
  whk_words.json  粵典詞表 — word -> jyutping variants
  whk_chars.json  粵典字表 — char -> {jyutping: count}
  whk_freq.json   corpus frequency — word -> count
  whk_eng.json    english index — term -> [[word:jyutping, score], ...]
"""
import json, os, re, sys

# Simplified -> traditional, from OpenCC's STCharacters.txt (Apache-2.0,
# /tmp/STCharacters.txt). Some chars map to several variants (为 -> 爲/為);
# callers try them all since words.hk uses HK forms.
S2T = {}
for line in open("/tmp/STCharacters.txt", encoding="utf-8"):
    if line.startswith("#") or not line.strip(): continue
    parts = line.rstrip("\n").split("\t")
    if len(parts) >= 2: S2T[parts[0]] = parts[1].split()

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
TMP = "/tmp"
os.makedirs(OUT, exist_ok=True)

words = json.load(open(TMP + "/whk_words.json", encoding="utf-8"))
chars = json.load(open(TMP + "/whk_chars.json", encoding="utf-8"))
freq = json.load(open(TMP + "/whk_freq.json", encoding="utf-8"))
eng = json.load(open(TMP + "/whk_eng.json", encoding="utf-8"))

# ---- 1. Jyutping for the HSK words -----------------------------------------
def char_jyutping(ch):
    c = chars.get(ch) or chars.get(ch + "*")
    if not c: return None
    return max(c.items(), key=lambda kv: kv[1])[0]  # most common reading

def word_jyutping(h):
    """word-level exact match first, else per-character join. None if a char is missing."""
    sim = h.replace(" ", "")
    key = "".join(S2T.get(ch, [ch])[0] for ch in sim)  # words.hk is traditional; HSK data is simplified
    # try the whole word, then each simplified char's variants, then the raw char
    for cand in (key, sim):
        hits = words.get(cand) or words.get(cand + "*")
        if hits: return hits[0]
    parts = []
    for ch in sim:
        r = None
        for v in S2T.get(ch, [ch]):
            r = char_jyutping(v)
            if r: break
        if not r: r = char_jyutping(ch)  # maybe words.hk lists the simplified form itself
        if not r: return None
        parts.append(r)
    return " ".join(parts)

hsk = [w for l in range(1, 7) for w in json.load(open(os.path.join(OUT, f"hsk{l}.json"), encoding="utf-8"))]
jyut = {}
missed = 0
for w in hsk:
    j = word_jyutping(w["h"])
    if j: jyut[str(w["id"])] = j
    else: missed += 1
json.dump(jyut, open(os.path.join(OUT, "jyutping.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
cov = 100 * len(jyut) / len(hsk)
print(f"jyutping.json  {len(jyut)} of {len(hsk)} HSK words ({cov:.1f}%, {missed} missed)")

# ---- 2. English glosses ----------------------------------------------------
# Invert the english index: word -> best english term.
inv = {}
for term, entries in eng.items():
    if term.startswith("!") or len(term) < 2 or len(term) > 40: continue
    for he, score in entries:
        h = he.split(":")[0]
        if score > inv.get(h, ("", 0))[1]: inv[h] = (term, score)

JUNK = re.compile(r"^(anota|isare|affirmative|negator|enumeration|highfalling|clausephrase|conjunction|classifier|adverb|particle|interrogative|onomatopoeia|measureword|exclamation|abbreviation|prefix|suffix|interjection|transitive|intransitive|propernoun)$")

# Sanity-check auto glosses against a system English word list — kills
# run-together junk ("clausephrase") and romanization leaks ("金" -> "jin").
DICTS = [w.strip().lower() for w in open("/usr/share/dict/words", encoding="utf-8", errors="ignore")]
DICTSET = set(DICTS)

def dict_ok(term):
    parts = [p for p in re.split(r"[ -]", term.lower()) if p]
    return all(p in DICTSET or p + "s" in DICTSET or p.rstrip("e") + "ing" in DICTSET for p in parts)

def auto_gloss(h):
    if len(h) < 2: return None  # single chars: curated only — auto senses are wrong too often
    g = inv.get(h)
    if not g or g[1] < 60: return None
    term = g[0].strip()
    if JUNK.fullmatch(term) or not dict_ok(term): return None
    return term

# Curated glosses for grammar words + common single-char verbs/adjectives,
# where the auto glosses pick the wrong sense ("食" -> "conquer").
CURATED = {
    "係": "to be", "唔": "not", "嘅": "of / 's", "咗": "-ed (done marker)", "咁": "so, like this",
    "啲": "some, a bit", "嚟": "to come", "嘢": "thing", "冇": "to not have", "佢": "he, she, it",
    "哋": "-s (plural)", "咩": "what", "啩": "probably", "喇": "particle (new state)", "啦": "particle (suggestion)",
    "囉": "particle (obvious)", "喎": "particle (hearsay)", "乜": "what", "噉": "thus, in that way",
    "掂": "done, sorted", "諗": "to think", "攞": "to take", "畀": "to give", "搵": "to look for",
    "睇": "to watch, to look", "瞓": "to sleep", "講": "to speak", "話": "to say", "而家": "now",
    "點解": "why", "點樣": "how", "好耐": "a long time", "唔該": "please; thanks (for a favour)",
    "多謝": "thank you (for a gift)", "唔好": "don't", "唔緊要": "it doesn't matter",
    "唔好意思": "sorry, excuse me", "早晨": "good morning", "晏晝": "afternoon", "收工": "off work",
    "開工": "to start work", "得閒": "free, available", "邊度": "where", "邊個": "who",
    "乜嘢": "what", "點算": "what to do", "食飯": "to eat (a meal)", "返工": "to go to work",
    "屋企": "home", "飲茶": "yum cha (tea + dim sum)", "食嘢": "to eat something",
    "睇戲": "to watch a movie", "傾偈": "to chat", "沖涼": "to take a shower", "瞓覺": "to sleep",
    "行路": "to walk", "搭車": "to ride (a vehicle)", "放工": "to get off work", "買嘢": "to shop",
    "諗計": "to think of a plan", "好彩": "lucky", "濕濕碎": "trivial, no big deal",
    "食": "to eat", "飲": "to drink", "行": "to walk", "走": "to run; to leave", "坐": "to sit",
    "買": "to buy", "賣": "to sell", "知": "to know", "愛": "to love", "想": "to want",
    "要": "to need", "去": "to go", "返": "to return", "睇書": "to read", "大": "big", "細": "small",
    "多": "many", "少": "few", "好": "good", "壞": "bad", "平": "cheap", "貴": "expensive",
    "快": "fast", "慢": "slow", "熱": "hot", "凍": "cold", "新": "new", "舊": "old",
    "靚": "pretty", "攰": "tired", "開心": "happy", "傷心": "sad", "嬲": "angry", "驚": "scared",
    "手機": "mobile phone", "電腦": "computer", "錢": "money", "老師": "teacher",
}
YUE_CHARS = set("冇嘅咗唔佢哋嘢嗰咁啲嚟攞啱喇啦咩囉喎咯噉乜掂諗俾畀搵嗮埗踎攰靚嬲冧掂瀡捽揈搣戙瞓篤黐氹乸腳踭躝揦掟揸揸鑊甧")

# ---- 3. Build the spoken-Cantonese tiers -----------------------------------
def gloss(h):
    if h in CURATED: return CURATED[h]
    return auto_gloss(h)

cands = {}
for h, f in freq.items():
    if not re.search(r"[一-鿿]", h) or len(h) > 4 or h not in words and h + "*" not in words: continue
    g = gloss(h)
    if not g: continue
    jy = word_jyutping(h)
    if not jy: continue
    cands[h] = (f, jy, g)

pool = sorted(cands.items(), key=lambda kv: -kv[1][0] * (2 if any(ch in YUE_CHARS for ch in kv[0]) else 1))
# curated words always in; then fill by frequency
selected, used = [], set()
for h in CURATED:
    if h in cands: selected.append((cands[h][0], h)); used.add(h)
for h, v in pool:
    if h in used: continue
    selected.append((v[0], h)); used.add(h)
selected = selected[:1200]

tiers, ids = {1: [], 2: [], 3: []}, 0
for i, (f, h) in enumerate(selected):
    tier = 1 if i < 400 else 2 if i < 800 else 3
    ids += 1
    tiers[tier].append({"id": ids, "h": h, "p": cands[h][1], "e": [gloss(h)], "l": tier})

for t, items in tiers.items():
    path = os.path.join(OUT, f"yue{t}.json")
    json.dump(items, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    yue_auth = sum(1 for w in items if any(ch in YUE_CHARS for ch in w["h"]))
    print(f"yue{t}.json  {len(items):4d} words  {os.path.getsize(path)//1024} KB  ({yue_auth} with Cantonese-specific chars)")
print("total", sum(len(v) for v in tiers.values()), "spoken-Cantonese words")