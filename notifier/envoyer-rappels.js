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
   ========================================================= */
"use strict";
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const webpush = require("web-push");
const { calculerEnvois } = require("./logique");

const exiger = (nom) => { const v = process.env[nom]; if (!v) { console.error(`Variable manquante : ${nom}`); process.exit(1); } return v; };

const FOYER = process.env.FOYER_ID || "principal";
const FUSEAU = process.env.FUSEAU || "America/Toronto";
const HEURE_RESUME = Number(process.env.HEURE_RESUME || 7);

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

  // Lectures limitées au strict nécessaire (forfait gratuit)
  const [rendezvous, tachesRappel, tachesAFaire, appareils, personnes, repasDoc] = await Promise.all([
    lister(foyer.collection("rendezvous").where("rappelEnvoye", "==", false)),
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
