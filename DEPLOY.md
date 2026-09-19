# Deploying Hanpath

The whole app is static files — no server, no database, no build step. That
means it can live on **GitHub Pages** for free, on a custom domain, and be
installed on your phone like a native app (that's the PWA part).

## 1. Push to GitHub

```sh
cd LearnChinese
git init                      # already done if a .git folder exists
git add -A
git commit -m "Hanpath: initial version"
git branch -M main
git remote add origin git@github.com:YOUR-USERNAME/hanpath.git   # or https URL
git push -u origin main
```

(Create an empty repo named `hanpath` on github.com first — no README,
no .gitignore, nothing, so the push goes cleanly.)

## 2. Turn on GitHub Pages

1. On the repo page: **Settings → Pages**
2. Under **Build and deployment → Source**: pick **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)** → Save
4. Wait ~1 minute. Your site is at:

```
https://YOUR-USERNAME.github.io/hanpath/
```

That's it — HTTPS, global CDN, offline caching, all automatic. Every `git push`
redeploys in under a minute.

## 3. (Optional) Custom domain

If you own a domain, e.g. `hanpath.yourname.com`:

1. Create a file named `CNAME` (no extension) in the repo root containing one
   line: `hanpath.yourname.com` — commit and push it.
2. At your domain provider's DNS settings, add one record:
   - Type `CNAME`, host `hanpath`, value `YOUR-USERNAME.github.io`
3. Back in **Settings → Pages**, enter the custom domain under **Custom
   domain** and save. Wait for the DNS check, then tick **Enforce HTTPS**.

If the domain was bought for this, you can also use the bare domain
(`yourname.com`) with four `A` records instead (185.199.108.153, .109, .110,
.111) — GitHub's docs list the current addresses.

## 4. Install on your phone ("add as an app")

This works because of `manifest.webmanifest` + `sw.js` — the site is a
**PWA**. It opens full-screen, no browser bars, shows your home-screen icon,
and works with no signal.

**iPhone (Safari — Chrome on iOS can't install PWAs):**
1. Open the URL in Safari
2. Share button (□↑) → **Add to Home Screen** → Add

**Android (Chrome):**
1. Open the URL in Chrome
2. Tap the install banner, or **⋮ → Add to Home screen / Install app**

**Desktop Chrome:** an install icon appears in the address bar.

> iOS note: iOS may purge website storage after weeks of not opening a site.
> Use Settings → Export backup now and then; the import merges without losing
> progress.

## 5. After every change

```sh
git add -A && git commit -m "..." && git push
```

…and bump `CACHE_VERSION` in `sw.js` first (e.g. `hanpath-v1` → `hanpath-v2`),
otherwise phones that already cached the app keep serving the old files.