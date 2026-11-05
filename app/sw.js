/* =========================================================
   FAMILLE — service worker
   - Fonctionnement hors ligne (fichiers de l'application en cache)
   - Réception des notifications push, même application fermée
   Augmentez VERSION à chaque mise à jour de l'application.
   ========================================================= */
const VERSION = "famille-v1.0.0";
const FICHIERS = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/app.js", "js/config.js", "js/etat.js", "js/icones.js", "js/ui.js", "js/utils.js", "js/notifications.js",
  "js/donnees/firebase.js", "js/donnees/local.js",
  "js/vues/accueil.js", "js/vues/agenda.js", "js/vues/commun.js", "js/vues/epicerie.js",
  "js/vues/menu.js", "js/vues/notes.js", "js/vues/reglages.js", "js/vues/taches.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/badge-96.png", "icons/favicon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Bibliothèques Firebase (versions figées) : cache d'abord
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const enCache = await c.match(req);
      if (enCache) return enCache;
      const rep = await fetch(req);
      if (rep.ok) c.put(req, rep.clone());
      return rep;
    }));
    return;
  }

  // Fichiers de l'application : réseau d'abord (mises à jour immédiates), cache si hors ligne
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((rep) => {
          if (rep.ok) { const copie = rep.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); }
          return rep;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) ||
          (req.mode === "navigate" ? caches.match("index.html") : Response.error()))
    );
  }
  // Le reste (base de données Firebase) passe directement : Firestore gère son propre cache hors ligne.
});

/* ---------- Notifications push ---------- */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corps: e.data && e.data.text() }; }
  const titre = d.titre || "FAMILLE";
  e.waitUntil(self.registration.showNotification(titre, {
    body: d.corps || "",
    icon: "icons/icon-192.png",
    badge: "icons/badge-96.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    vibrate: [120, 60, 120],
    data: { url: d.url || "./#/accueil" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const cible = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenetres) {
      if (f.url.startsWith(self.registration.scope)) { await f.focus(); try { await f.navigate(cible); } catch { /* ignore */ } return; }
    }
    await self.clients.openWindow(cible);
  })());
});
