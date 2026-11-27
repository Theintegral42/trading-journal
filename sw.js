// Service worker : l'app fonctionne hors-ligne (réseau d'abord, cache en secours).
const CACHE = "tj-v2.8.0";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll([
        "./", "index.html", "css/app.css", "manifest.webmanifest",
        "js/app.js", "js/store.js", "js/data.js", "js/cloud.js", "js/idb.js", "js/util.js", "js/config.js",
        "js/ui/components.js", "js/ui/journal.js", "js/ui/tradelog.js", "js/ui/dashboard.js", "js/ui/notes.js", "js/ui/investment.js", "js/ui/currency.js", "js/ui/plan.js", "js/plan.js", "js/invest.js", "js/quotes.js", "js/ui/settings.js",
        "js/lib/preact-htm.js", "js/lib/chart.umd.js", "js/lib/msal-browser.min.js",
        "icons/icon-192.png", "icons/icon-512.png",
      ]).catch(() => {})
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // Microsoft Graph / login : jamais en cache
  e.respondWith(
    fetch(req, { cache: "no-cache" }) // revalide toujours : les mises à jour sont prises en compte immédiatement
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
