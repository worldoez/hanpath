#!/usr/bin/env python3
"""One-time generator: turns the raw HSK 1-6 dataset into compact JSON files
for the app. Re-run only if you change the tagging or want a new source."""
import json, os, re, sys

SRC = os.environ.get("HSK_SRC", "/tmp/hsk_flat.json")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(OUT, exist_ok=True)

# ---- Domain tagging -------------------------------------------------------
# Ordered map: first matching domain wins. Keywords are matched against the
# lowercase English glosses. Rough but useful for grouping.
DOMAINS = [
    ("food",     ["eat", "drink", "rice", "noodle", "tea", "meat", "vegetabl", "fruit", "restaurant", "cook", "taste", "hungry", "meal", "dish", "beer", "coffee", "milk", "egg", "sugar", "salt", "snack", "breakfast", "lunch", "dinner", "soup", "bread", "wine", "food", "flavor", "spicy", "sweet", "sour", "bitter", "delicious", "delicacy", "dessert", "grill", "fry ", "steam", "menu", "hunger", "thirsty", "feast"]),
    ("travel",   ["travel", "trip", "airport", "plane", "flight", "hotel", "ticket", "train", "tourist", "passport", "visa", "luggage", "map", "customs", "border", "tour", "journey", "vacation", "holiday", "sightseeing", "abroad", "foreign", "embassy", "check in", "suitcase", "backpack", "guide", "book ", "reserve", "camping", "beach", " scenic", "photograph", "camera", "souvenir"]),
    ("transport",["car", "bus", "bike", "bicycle", "drive", "driver", "subway", "taxi", "ship", "boat", "ride", "walk", "road", "traffic", "vehicle", "sail", "row ", "helicopter", "motorcycle", "station", "platform", "fare", "seat ", "speed", "parking", "highway", "pedestrian", "commute"]),
    ("business", ["company", "contract", "business", "client", "customer", "negotiat", "invest", "stock", "profit", "loss", "export", "import", "finance", "manager", "boss", "employee", "staff", "colleague", "recruit", "salary", "bonus", "office", "project", "report", "enterprise", "corporat", "firm", "industry", "economy", "trade", "brand", "product", "quality", "competit", "advertise", "cooperat", "signature", "sign ", "establish", "meeting", "conference", "department", "supervis", "executive", "start a business", "market share", "entrepreneur", "commerce", "commercial", "promotion", "quota", "goods", "cargo", "wholesal", "retail"]),
    ("work",     ["work", "job", "career", "employ", "interview", "training", "skill", "experience", "duty", "shift", "labor", "task", "busy", "overtime", "resign", "unemploy", "colleag", "coworker", "profession", "occupation", "vacation day", "leave ", "workload", "collegue"]),
    ("education",["school", "class", "study", "learn", "exam", "test", "homework", "university", "college", "major", "degree", "research", "science", "student", "teacher", "professor", "lesson", "course", "knowledge", "library", "graduate", "enroll", "semester", "campus", "tuition", "scholarship", "diploma", "review ", "preview", "recite", "translate", "language", "grammar", "vocabular", "pronunciat", "practice", "exercise ", "textbook", "stationery", "pen ", "pencil", "paper"]),
    ("home",     ["home", "house", "apartment", "room", "kitchen", "bathroom", "bedroom", "living room", "furniture", "table", "chair", "bed ", "door", "window", "wall", "lamp", "fridge", "refrigerator", "mirror", "towel", "soap", "shampoo", "toothbrush", "clean", "tidy", "sweep", "mop", "laundry", "iron ", "vacuum", "rent", "landlord", "move house", "neighborhood", "courtyard", "balcony", "stair", "elevator", "key ", "lock", "curtain", "quilt", "pillow", "sheet", "pot ", "pan ", "cup", "bowl", "chopstick"]),
    ("money",    ["buy", "sell", "price", "money", "cheap", "expensive", "pay", "shopping", "discount", "yuan", "cash", "credit card", "cost", "spend", "save", "expens", "wage", "income", "wealth", "poor", "rich", "bargain", "free ", "shop", "mall", "store", "supermarket", "wallet", "coin", "receipt", "refund", "exchange rate", "currency", "deposit", "withdraw", "loan", "debt", "tax ", "budget", "afford", "donate", "charity", "wealthy", "bankrupt", "poverty"]),
    ("tech",     ["computer", "phone", "telephone", "internet", "email", "software", "website", "machine", "technology", "digital", "online", "network", "robot", "electronic", "battery", "screen", "keyboard", "data", "program", "wifi", "message", "text message", "video", "photo", "charge", "plug", "electric", "signal", "download", "upload", "click", "app ", "application", "device", "hardware", "code", "artificial intelligence", "internet access", "search engine", "social media"]),
    ("sports",   ["sport", "exercise", "run", "swim", "ball", "football", "soccer", "basketball", "tennis", "badminton", "volleyball", "ping pong", "table tennis", "game", "match", "team", "win", "lose", "gym", "fitness", "dance", "kung fu", "martial", "taiji", "skate", "ski", "climb", "yoga", "race", "champion", "athlete", "coach", "training session", "score", "goal", "olympic"]),
    ("family",   ["family", "mother", "father", "brother", "sister", "son", "daughter", "friend", "husband", "wife", "child", "grandfather", "grandmother", "neighbor", "marry", "wedding", "relative", "parent", "couple", "baby", "boy", "girl", "elder"]),
    ("people",   ["police", "soldier", "waiter", "audience", "guest", "crowd", "everyone", "other people", "gentleman", "lady", "adult", "youth", "person", "human", "stranger", "customer service", "patient", "driver", "passenger"]),
    ("time",     ["today", "tomorrow", "yesterday", "week", "month", "year", "hour", "minute", "second", "morning", "noon", "afternoon", "evening", "night", "o'clock", "season", "spring", "summer", "autumn", "fall ", "winter", "date", "birthday", "age ", "clock", "calendar", "now ", "time", "moment", "ago", "later", "early", "late", "dawn", "dusk"]),
    ("numbers",  ["number", "hundred", "thousand", "ten thousand", "half", "zero", "double", "amount", "quantity", "percent", "count", "several", "few ", "many", "much ", "single", "couple of", "more", "most", "less", "least", "increase", "decrease"]),
    ("places",   ["city", "country", "hospital", "bank", "park", "street", "cinema", "square", "village", "town", "building", "floor", "address", "place", "location", "north", "south", "east", "west", "left", "right", "front", "back ", "beside", "near", "far", "downtown", "suburb", "district", "museum", "theater", "gym ", "playground", "temple", "church", "post office", "public", "entrance", "exit", "corner", "distance"]),
    ("body",     ["body", "head", "hand", "foot", "eye", "ear", "nose", "mouth", "tooth", "hair", "face", "leg", "arm", "finger", "heart", "stomach", "skin", "blood", "bone", "brain", "sick", "ill", "medicine", "pain", "hurt", "injur", "health", "healthy", "fever", "cough", "tired", "sleep", "wake", "dream", "rest", "breathe"]),
    ("weather",  ["weather", "rain", "snow", "wind", "sky", "sun", "sunshine", "moon", "star", "cloud", "fog", "temperature", "degree", "warm", "cool", "humid", "dry ", "typhoon", "storm", "thunder", "lightning", "climate", "air"]),
    ("nature",   ["mountain", "river", "sea", "ocean", "lake", "tree", "flower", "grass", "forest", "leaf", "animal", "dog", "cat", "bird", "horse", "fish", "insect", "land", "soil", "stone", "sand", "field", "plant", "grow", "wild", "beast"]),
    ("clothes",  ["cloth", "wear", "shirt", "trousers", "pants", "shoes", "hat", "dress", "skirt", "sock", "coat", "jacket", "uniform", "fashion", "size ", "fit ", "wash"]),
    ("feelings", ["happy", "sad", "angry", "love", "hate", "fear", "worry", "excited", "glad", "disappoint", "satisf", "feel", "emotion", "like ", "enjoy", "fun ", "interesting", "boring", "surprise", "nervous", "confident", "proud", "jealous", "lonely", "hope", "wish", "regret", "shame", "comfort", "sympathy", "grateful", "thank"]),
]
DOMAIN_LABELS = {
    "food": "Food & Drink", "travel": "Travel", "transport": "Getting Around",
    "business": "Business Chinese", "work": "Work & Office", "education": "School & Study",
    "home": "Home & Daily Life", "money": "Shopping & Money", "tech": "Technology",
    "sports": "Sports & Exercise", "family": "Family & Friends", "people": "People",
    "time": "Time & Dates", "numbers": "Numbers & Quantity", "places": "Places & Directions",
    "body": "Body & Health", "weather": "Weather", "nature": "Nature & Animals",
    "clothes": "Clothing", "feelings": "Feelings",
}

def tag(english):
    text = " ".join(english).lower()
    for key, words in DOMAINS:
        for w in words:
            if w in text:
                return key
    return None

JUNK = re.compile(r"^(CL[:|]|see |cf\. |old variant|variant of|abbr\.|also written|also pr\.|also |former|Taiwan pr\.|archaic|lit\. is)")

def clean(eng):
    return [t for t in eng if not JUNK.match(t)
            and not re.search(r"\[\w+\]", t)
            and not re.fullmatch(r"[一-鿿｜|]+", t)]

# ---- Build ----------------------------------------------------------------
raw = json.load(open(SRC, encoding="utf-8"))
words = []
for w in raw:
    eng = clean([t for t in w["translations"].get("eng", []) if t.strip()])
    if not eng:
        continue
    words.append({
        "id": w["id"],
        "h": w["hanzi"],
        "p": w["pinyin"].replace("u:", "ü"),  # normalize old-style "u:" to ü
        "e": eng[:3],
        "l": w["level"],
        "d": tag(eng),
    })

by_level = {}
for w in words:
    by_level.setdefault(w["l"], []).append(w)

for level, items in sorted(by_level.items()):
    path = os.path.join(OUT, f"hsk{level}.json")
    json.dump(items, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"hsk{level}.json  {len(items):5d} words  {os.path.getsize(path)//1024} KB")

# domains.json: domain -> {level: [ids]} for cross-level domain packs
domains = {}
for w in words:
    if w["d"]:
        domains.setdefault(w["d"], {}).setdefault(w["l"], []).append(w["id"])
meta = {"labels": DOMAIN_LABELS,
            "counts": {k: {int(l): len(ids) for l, ids in sorted(d.items())} for k, d in domains.items()}}
json.dump(meta, open(os.path.join(OUT, "domains.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
total = sum(len(v) for lv in by_level.values() for v in lv)
print(f"total {len(words)} words, {len(domains)} domains, {sum(os.path.getsize(os.path.join(OUT,f)) for f in os.listdir(OUT))//1024} KB")