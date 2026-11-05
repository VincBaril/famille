/* =========================================================
   Notifications
   - Chaque téléphone s'abonne aux notifications « push » (Web Push,
     standard et gratuit). L'abonnement est enregistré dans la base.
   - Le petit programme « notifier » (GitHub Actions, gratuit) lit
     les rappels toutes les 10 minutes et envoie les notifications,
     même si l'application est fermée.
   - En mode démo : les rappels s'affichent seulement quand
     l'application est ouverte.
   ========================================================= */
import { CONFIG, MODE_DEMO } from "./config.js";
import { db, etat, moi } from "./etat.js";
import { nouvelIdLocal, heure } from "./utils.js";

const CLE = "famille:appareil";
export const PREFS_DEFAUT = { rendezvous: true, taches: true, retard: true, rappels: true };

export function infosAppareil() {
  let o;
  try { o = JSON.parse(localStorage.getItem(CLE) || "null"); } catch { o = null; }
  if (!o) { o = { id: nouvelIdLocal(), actif: false, prefs: { ...PREFS_DEFAUT } }; sauver(o); }
  o.prefs = { ...PREFS_DEFAUT, ...(o.prefs || {}) };
  return o;
}
function sauver(o) { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch { /* ignore */ } }

/** Service worker prêt (avec délai maximal pour ne jamais bloquer l'interface) */
function swPret(ms = 4000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Service worker indisponible. Rechargez l'application.")), ms))
  ]);
}

export const estSupporte = () => "serviceWorker" in navigator && "Notification" in window;
export const pushSupporte = () => estSupporte() && "PushManager" in window && !!CONFIG.vapidPublicKey && !MODE_DEMO;
export const permission = () => ("Notification" in window ? Notification.permission : "denied");

function cleVapid(b64) {
  const p = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function nomAppareil() {
  const ua = navigator.userAgent;
  const m = ua.match(/Android [\d.]+; ([^;)]+)/);
  return m ? m[1].trim() : (/(iPhone|iPad)/.exec(ua)?.[1] || "Navigateur");
}

async function enregistrerAbonnement(o) {
  const reg = await swPret();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid(CONFIG.vapidPublicKey) });
  db().definir("appareils", o.id, {
    abonnement: JSON.parse(JSON.stringify(sub)),
    personneId: moi() || null,
    prefs: o.prefs,
    nom: nomAppareil(),
    majLe: Date.now()
  });
}

/** Active les notifications sur ce téléphone */
export async function activer() {
  if (!estSupporte()) throw new Error("Ce navigateur ne permet pas les notifications.");
  const p = await Notification.requestPermission();
  if (p !== "granted") throw new Error("Permission refusée. Autorisez les notifications pour FAMILLE dans les paramètres Android.");
  const o = infosAppareil();
  if (pushSupporte()) await enregistrerAbonnement(o);
  o.actif = true; sauver(o);
  return o;
}

export async function desactiver() {
  const o = infosAppareil();
  o.actif = false; sauver(o);
  try {
    const reg = await swPret(1500);
    const sub = await reg.pushManager?.getSubscription();
    await sub?.unsubscribe();
  } catch { /* ignore */ }
  if (!MODE_DEMO) db().supprimer("appareils", o.id);
}

export function majPreferences(prefs) {
  const o = infosAppareil();
  o.prefs = { ...o.prefs, ...prefs }; sauver(o);
  if (o.actif && pushSupporte()) db().definir("appareils", o.id, { prefs: o.prefs, majLe: Date.now() }, { fusion: true });
}

/** À appeler quand la personne de ce téléphone change */
export function majPersonne() {
  const o = infosAppareil();
  if (o.actif && pushSupporte()) db().definir("appareils", o.id, { personneId: moi() || null, majLe: Date.now() }, { fusion: true });
}

/** Au démarrage : renouvelle l'abonnement s'il a changé ou expiré */
export async function verifierAbonnement() {
  const o = infosAppareil();
  if (!o.actif || !pushSupporte() || permission() !== "granted") return;
  try { await enregistrerAbonnement(o); } catch (e) { console.warn("Abonnement push :", e); }
}

export async function notificationTest() {
  if (permission() !== "granted") throw new Error("Activez d'abord les notifications.");
  const reg = await swPret();
  await reg.showNotification("FAMILLE", {
    body: "Les notifications fonctionnent sur ce téléphone. 🎉",
    icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "test"
  });
}

/* ---------- Vérification locale (mode démo, application ouverte) ---------- */
let minuterieLocale = null;
export function demarrerVerificationLocale() {
  if (!MODE_DEMO || minuterieLocale) return;
  const verifier = async () => {
    const o = infosAppareil();
    if (!o.actif || permission() !== "granted") return;
    const maintenant = Date.now();
    let reg; try { reg = await swPret(); } catch { return; }
    const montrer = (titre, corps, tag) => reg?.showNotification(titre, { body: corps, icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag });
    for (const r of etat.rendezvous) {
      if (!r.rappelEnvoye && r.rappelA && r.rappelA <= maintenant) {
        if (o.prefs.rendezvous) montrer(`Rendez-vous : ${r.titre}`, `${heure(r.heureDebut)}${r.adresse ? " · " + r.adresse : ""}`, "rdv-" + r.id);
        db().modifier("rendezvous", r.id, { rappelEnvoye: true });
      }
    }
    for (const t of etat.taches) {
      if (!t.rappelEnvoye && t.rappelA && t.rappelA <= maintenant) {
        if (o.prefs.rappels && t.statut !== "terminee") montrer(`Rappel : ${t.titre}`, t.description || "Tâche à effectuer", "tache-" + t.id);
        db().modifier("taches", t.id, { rappelEnvoye: true });
      }
    }
  };
  minuterieLocale = setInterval(verifier, 30000);
  setTimeout(verifier, 3000);
}
