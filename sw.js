/* Hanpath service worker — offline cache. Bump CACHE_VERSION when you change files. */
"use strict";
const CACHE_VERSION = "hanpath-v5";
const CORE = [
  "./", "./index.html", "./css/styles.css",
  "./js/app.js", "./js/srs.js", "./js/tts.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
  "./data/hsk1.json", "./data/hsk2.json", "./data/hsk3.json",
  "./data/hsk4.json", "./data/hsk5.json", "./data/hsk6.json",
  "./data/domains.json", "./data/jyutping.json",
  "./data/yue1.json", "./data/yue2.json", "./data/yue3.json",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // data files and app shell: cache-first (content is versioned by deploys)
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});