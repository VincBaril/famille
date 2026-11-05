/* =========================================================
   Couche de données — MODE DÉMO (sans serveur)
   Les données sont gardées dans ce navigateur seulement.
   Les onglets d'un même navigateur se synchronisent entre eux
   (pratique pour simuler deux téléphones).
   Le code d'accès est conservé sous forme d'empreinte SHA-256,
   jamais en clair.
   ========================================================= */
const PREFIXE = "famille-demo:";
const CLE_CODE = PREFIXE + "empreinte-code";
const CLE_SESSION = PREFIXE + "session";

function lireStockage(cle, defaut) {
  try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; }
}
function ecrireStockage(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { console.warn(e); }
}
async function empreinte(texte) {
  const octets = new TextEncoder().encode("famille|" + texte);
  const h = await crypto.subtle.digest("SHA-256", octets);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export async function creerBackend() {
  const ecouteurs = new Map(); // col -> Set(fn)
  const abonnesAuth = new Set();
  const abonnesSync = new Set();

  const lireCol = (col) => lireStockage(PREFIXE + "col:" + col, {});
  const ecrireCol = (col, obj) => { ecrireStockage(PREFIXE + "col:" + col, obj); diffuser(col); };

  function diffuser(col) {
    (ecouteurs.get(col) || new Set()).forEach((fn) => fn());
  }
  // Synchronisation entre onglets
  addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(PREFIXE)) return;
    if (e.key === CLE_SESSION) abonnesAuth.forEach((cb) => cb(!!lireStockage(CLE_SESSION, false)));
    if (e.key.startsWith(PREFIXE + "col:")) diffuser(e.key.slice((PREFIXE + "col:").length));
  });

  const etatSync = () => (navigator.onLine ? "ok" : "hors-ligne");
  addEventListener("online", () => abonnesSync.forEach((cb) => cb(etatSync())));
  addEventListener("offline", () => abonnesSync.forEach((cb) => cb(etatSync())));

  return {
    mode: "demo",

    surAuth(cb) {
      abonnesAuth.add(cb);
      queueMicrotask(() => cb(!!lireStockage(CLE_SESSION, false)));
      return () => abonnesAuth.delete(cb);
    },

    premiereFois() { return !lireStockage(CLE_CODE, null); },

    async connecter(code) {
      const h = await empreinte(code);
      const enregistre = lireStockage(CLE_CODE, null);
      if (!enregistre) ecrireStockage(CLE_CODE, h);
      else if (enregistre !== h) throw new Error("Code d'accès incorrect.");
      ecrireStockage(CLE_SESSION, true);
      abonnesAuth.forEach((cb) => cb(true));
    },

    async deconnecter() {
      ecrireStockage(CLE_SESSION, false);
      abonnesAuth.forEach((cb) => cb(false));
    },

    async changerCode(ancien, nouveau) {
      if ((await empreinte(ancien)) !== lireStockage(CLE_CODE, null)) throw new Error("Le code actuel est incorrect.");
      ecrireStockage(CLE_CODE, await empreinte(nouveau));
    },

    async envoyerReinitialisation() {
      throw new Error("Non disponible en mode démo.");
    },

    ecouter(col, cb, { ordre, sens = "asc", limite } = {}) {
      const emettre = () => {
        let docs = Object.entries(lireCol(col)).map(([id, d]) => ({ id, ...d }));
        if (ordre) {
          docs.sort((a, b) => ((a[ordre] ?? 0) > (b[ordre] ?? 0) ? 1 : (a[ordre] ?? 0) < (b[ordre] ?? 0) ? -1 : 0));
          if (sens === "desc") docs.reverse();
        }
        if (limite) docs = docs.slice(0, limite);
        cb(docs, { depuisCache: false });
      };
      if (!ecouteurs.has(col)) ecouteurs.set(col, new Set());
      ecouteurs.get(col).add(emettre);
      queueMicrotask(emettre);
      return () => ecouteurs.get(col).delete(emettre);
    },

    async lire(col, id) {
      const d = lireCol(col)[id];
      return d ? { id, ...d } : null;
    },

    nouvelId,

    ajouter(col, data) {
      const id = nouvelId();
      const c = lireCol(col); c[id] = data; ecrireCol(col, c);
      return id;
    },

    definir(col, id, data, { fusion = false } = {}) {
      const c = lireCol(col);
      c[id] = fusion ? { ...(c[id] || {}), ...data } : data;
      ecrireCol(col, c);
    },

    modifier(col, id, data) {
      const c = lireCol(col);
      if (!c[id]) return;
      c[id] = { ...c[id], ...data };
      ecrireCol(col, c);
    },

    supprimer(col, id) {
      const c = lireCol(col); delete c[id]; ecrireCol(col, c);
    },

    surEtatSync(cb) { abonnesSync.add(cb); cb(etatSync()); return () => abonnesSync.delete(cb); }
  };
}
