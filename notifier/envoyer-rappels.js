/* =========================================================
   FAMILLE — envoi des rappels (notifications push)
   Lancé toutes les 10 minutes par GitHub Actions (gratuit).
   Variables d'environnement (secrets GitHub) :
     FIREBASE_SERVICE_ACCOUNT  contenu JSON de la clé du compte de service
     VAPID_PUBLIC_KEY          clé publique VAPID
     VAPID_PRIVATE_KEY         clé privée VAPID
     VAPID_CONTACT             (facultatif) courriel de contact, ex. mailto:vous@exemple.com
     FOYER_ID                  (facultatif) « principal » par défaut
     FUSEAU                    (facultatif) « America/Toronto » par défaut
     HEURE_RESUME              (facultatif) heure du résumé du matin, 7 par défaut
     CALENDRIER_PERSONNE_1     (facultatif) lien ICS publié du calendrier Outlook de la personne 1
     CALENDRIER_PERSONNE_2     (facultatif) lien ICS publié du calendrier Outlook de la personne 2
     RAPPEL_OUTLOOK            (facultatif) minutes avant un rendez-vous Outlook (60 par défaut, « aucun » pour désactiver)
     SYNC_OUTLOOK_MINUTES      (facultatif) fréquence de lecture des calendriers Outlook, 30 par défaut
   Confidentialité : ce programme n'écrit JAMAIS de titre, d'heure, de lieu
   ni de lien dans le journal (les journaux d'un dépôt public sont visibles).
   ========================================================= */
"use strict";
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const webpush = require("web-push");
const { calculerEnvois } = require("./logique");
const { occurrences, fusionner, planifier } = require("./calendriers");

const exiger = (nom) => { const v = process.env[nom]; if (!v) { console.error(`Variable manquante : ${nom}`); process.exit(1); } return v; };

const FOYER = process.env.FOYER_ID || "principal";
const FUSEAU = process.env.FUSEAU || "America/Toronto";
const HEURE_RESUME = Number(process.env.HEURE_RESUME || 7);
const JOUR = 86400000;

/* ---------- Calendriers Outlook (facultatif) ---------- */
const CALENDRIERS = [["p1", process.env.CALENDRIER_PERSONNE_1, 1], ["p2", process.env.CALENDRIER_PERSONNE_2, 2]]
  .map(([id, url, numero]) => [id, String(url || "").trim().replace(/^webcal:\/\//i, "https://"), numero])
  .filter(([, url]) => url);
const INTERVALLE_SYNC = Math.max(10, Number(process.env.SYNC_OUTLOOK_MINUTES || 30)) * 60000;
const RAPPEL_OUTLOOK = (() => {
  const v = String(process.env.RAPPEL_OUTLOOK ?? "").trim();
  if (!v) return 60;
  if (/^(aucun|non|none)$/i.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 60;
})();

async function lireCalendrier(url, numero) {
  // Ne jamais afficher l'adresse ni le message d'erreur brut : ils peuvent contenir le lien secret.
  let rep;
  try {
    rep = await fetch(url, { headers: { "User-Agent": "FAMILLE/1.0", Accept: "text/calendar, */*" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new Error(`calendrier de la personne ${numero} : ${e && e.name === "TimeoutError" ? "délai dépassé" : "connexion impossible ou lien invalide"}`);
  }
  if (!rep.ok) throw new Error(`calendrier de la personne ${numero} : le serveur a répondu ${rep.status}${rep.status === 404 ? " (publication annulée ou lien incorrect ?)" : ""}`);
  const texte = await rep.text();
  if (!/BEGIN:VCALENDAR/i.test(texte)) throw new Error(`calendrier de la personne ${numero} : ce n'est pas un lien ICS (utilisez le lien qui se termine par .ics)`);
  return texte;
}

async function synchroOutlook(db, foyer, lister, maintenant) {
  const fenetre = { debut: maintenant - 30 * JOUR, fin: maintenant + 120 * JOUR, fuseau: FUSEAU };
  const parPersonne = [];
  for (const [personneId, url, numero] of CALENDRIERS) {
    const texte = await lireCalendrier(url, numero);
    parPersonne.push({ personneId, occurrences: occurrences(texte, fenetre) });
  }
  const dateDebutFenetre = dateEtHeure(FUSEAU, fenetre.debut).date;
  const existants = await lister(foyer.collection("rendezvous").where("date", ">=", dateDebutFenetre));
  const voulus = fusionner(parPersonne);
  const { ecritures, suppressions } = planifier({ voulus, existants, maintenant, rappelMin: RAPPEL_OUTLOOK, dateDebutFenetre });
  const ops = [...ecritures.map((e) => ["ecrire", e]), ...suppressions.map((id) => ["supprimer", id])];
  for (let i = 0; i < ops.length; i += 400) {
    const lot = db.batch();
    for (const [type, x] of ops.slice(i, i + 400)) {
      const ref = foyer.collection("rendezvous").doc(type === "ecrire" ? x.id : x);
      if (type === "ecrire") lot.set(ref, x.data, { merge: x.fusion }); else lot.delete(ref);
    }
    await lot.commit();
  }
  await foyer.collection("reglages").doc("general").set({ dernierSyncOutlook: maintenant }, { merge: true });
  console.log(`Outlook : ${CALENDRIERS.length} calendrier(s), ${voulus.size} rendez-vous, ${ecritures.length} ajouté(s) ou modifié(s), ${suppressions.length} retiré(s).`);
}

function dateEtHeure(fuseau, ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) };
}

async function principal() {
  initializeApp({ credential: cert(JSON.parse(exiger("FIREBASE_SERVICE_ACCOUNT"))) });
  webpush.setVapidDetails(process.env.VAPID_CONTACT || "mailto:famille@example.com", exiger("VAPID_PUBLIC_KEY"), exiger("VAPID_PRIVATE_KEY"));
  const db = getFirestore();
  const foyer = db.collection("foyers").doc(FOYER);
  const lister = (q) => q.get().then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));

  const maintenant = Date.now();
  const { date: dateLocale, heure: heureLocale } = dateEtHeure(FUSEAU, maintenant);
  const demainLocal = dateEtHeure(FUSEAU, maintenant + 86400000).date;

  const reglagesDoc = await foyer.collection("reglages").doc("general").get();
  const reglages = reglagesDoc.exists ? reglagesDoc.data() : {};
  const resumeDu = heureLocale >= HEURE_RESUME && reglages.dernierResume !== dateLocale;

  // Calendriers Outlook : lus au plus toutes les 30 minutes (ou tout de suite si lancé à la main)
  const forcer = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  if (CALENDRIERS.length && (forcer || !reglages.dernierSyncOutlook || maintenant - reglages.dernierSyncOutlook >= INTERVALLE_SYNC - 60000)) {
    try { await synchroOutlook(db, foyer, lister, maintenant); }
    catch (e) { console.warn(`Outlook : synchronisation reportée — ${e.message}`); }
  }

  // Lectures limitées au strict nécessaire (forfait gratuit)
  const [rendezvous, tachesRappel, tachesAFaire, appareils, personnes, repasDoc] = await Promise.all([
    // Seulement les rappels arrivés à échéance (dernières 6 h) : peu de lectures, même avec Outlook
    lister(foyer.collection("rendezvous").where("rappelA", ">=", maintenant - 6 * 3600000).where("rappelA", "<=", maintenant)),
    lister(foyer.collection("taches").where("rappelEnvoye", "==", false)),
    resumeDu ? lister(foyer.collection("taches").where("statut", "==", "a_faire")) : Promise.resolve([]),
    lister(foyer.collection("appareils")),
    lister(foyer.collection("personnes")),
    resumeDu ? foyer.collection("repas").doc(dateLocale).get() : Promise.resolve(null)
  ]);
  const taches = [...new Map([...tachesAFaire, ...tachesRappel].map((t) => [t.id, t])).values()];

  const { envois, majs } = calculerEnvois({
    maintenant, dateLocale, demainLocal, heureLocale, heureResume: HEURE_RESUME,
    rendezvous, taches, personnes, appareils, reglages,
    repasDuJour: repasDoc && repasDoc.exists ? repasDoc.data() : null
  });

  // Envoi des notifications
  const parId = new Map(appareils.map((a) => [a.id, a]));
  const expires = new Set();
  let ok = 0;
  for (const e of envois) {
    const a = parId.get(e.appareilId);
    if (!a || expires.has(a.id)) continue;
    try {
      await webpush.sendNotification(a.abonnement, JSON.stringify(e.payload), { TTL: 6 * 3600, urgency: "high" });
      ok++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) expires.add(a.id);
      else console.warn(`Échec d'envoi vers ${a.nom || a.id} :`, err.statusCode || err.message);
    }
  }

  // Marquage « rappel envoyé » + nettoyage des abonnements expirés
  const lot = db.batch();
  for (const m of majs) lot.set(foyer.collection(m.col).doc(m.id), m.data, { merge: true });
  for (const id of expires) lot.delete(foyer.collection("appareils").doc(id));
  if (majs.length || expires.size) await lot.commit();

  console.log(`[${dateLocale} ${heureLocale}h ${FUSEAU}] ${ok}/${envois.length} notification(s) envoyée(s), ${majs.length} mise(s) à jour, ${expires.size} abonnement(s) expiré(s) retiré(s).`);
}

principal().catch((e) => { console.error(e); process.exit(1); });
