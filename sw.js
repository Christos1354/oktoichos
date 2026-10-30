// Οκτώηχος: λειτουργία χωρίς διαδίκτυο · έκδοση v30 (30-10-2026: κοινή βιβλιοθήκη, αναγνώστης PDF στον ιστότοπο)
// (22-10-2026) Σελίδες ΚΑΙ αρχεία .js: πρώτα από το διαδίκτυο (για να έρχεται πάντα η νέα έκδοση),
// αλλιώς από την αποθήκη. Έτσι σε κάθε ενημέρωση ανεβαίνουν ΜΟΝΟ τα αρχεία που άλλαξαν.
const CACHE = "oktoichos-v30";
const CORE = ["./", "./index.html", "./selida-simeron.html", "./selida-megali-paraskevi.html", "./selida-allilouia.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon.png", "./pdfjs/pdf.min.js?v=1", "./pdfjs/pdf.worker.min.js?v=1"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// από το διαδίκτυο, με όριο χρόνου· αν δεν απαντήσει, από την αποθήκη
function netFirst(req, key, ms) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(key, { ignoreSearch: true }).then(hit => hit || caches.match("./index.html"));
    const t = setTimeout(() => { if (!done) { done = true; fromCache().then(resolve); } }, ms);
    fetch(req).then(r => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      if (!done) { done = true; clearTimeout(t); resolve(r); }
    }).catch(() => { if (!done) { done = true; clearTimeout(t); fromCache().then(resolve); } });
  });
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith("library.json")) return;
    const p = url.pathname;
    if (req.mode === "navigate" || p.endsWith("/") || p.endsWith(".html") || p.endsWith(".js") || p.endsWith(".webmanifest")) {
      const key = (p.endsWith("/") || p.endsWith("/index.html")) ? "./index.html" : new Request(url.origin + p);
      e.respondWith(netFirst(req, key, 6000));
      return;
    }
  }
  // Γραμματοσειρές, αναγνώστης PDF, εικόνες, ήχοι: από την αποθήκη, αλλιώς από το διαδίκτυο
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === "cdnjs.cloudflare.com";
  if (!cacheable) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
