// AstroFly Alpha - Service Worker: App-Huelle offline vorhalten
// VERSION wird bei jedem Deploy zusammen mit den ?v=-Marken hochgezaehlt
const VERSION = "2026-10-31-a7";
const SHELL = "astrofly-alpha-shell-" + VERSION;
const LIBS = "astrofly-alpha-libs";
const SHELL_FILES = [
  "./", "index.html",
  "style.css?v=" + VERSION, "i18n.js?v=" + VERSION, "objectinfo.js?v=" + VERSION, "app.js?v=" + VERSION,
  "vendor/pako.min.js", "vendor/mp4-muxer.js", "vendor/webm-muxer.js", "vendor/UTIF.js",
  "demo/orion_starless.jpg", "demo/orion_starmask.jpg", "demo/orion.wcs",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
];
// Bibliotheken und KI-Modelle (versionierte URLs): einmal geladen, dann aus dem Cache
const LIB_HOSTS = ["cdn.jsdelivr.net", "huggingface.co", "cdn-lfs.huggingface.co", "cdn-lfs-us-1.huggingface.co", "cdn-lfs.hf.co", "cdn-lfs-us-1.hf.co"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // cache: "reload" umgeht den HTTP-Cache - sonst landet eine alte Datei im neuen Shell-Cache
    await c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith("astrofly-alpha-shell-") && k !== SHELL) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // App-Huelle: Cache zuerst, Netz als Reserve; Navigation offline -> index.html
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: false });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname.includes("/alpha/")) {
          const c = await caches.open(SHELL);
          c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        if (req.mode === "navigate") {
          const idx = await caches.match("index.html");
          if (idx) return idx;
        }
        throw err;
      }
    })());
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(LIBS);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    })());
  }
  // alles andere (Katalogserver): immer live
});
