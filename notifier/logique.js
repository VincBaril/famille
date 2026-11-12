/* =========================================================
   Logique des rappels (sans accès réseau : facile à tester)
   Reçoit l'état de la base et retourne :
   - envois : notifications à envoyer, par appareil
   - majs   : documents à marquer comme « rappel envoyé »
   ========================================================= */
"use strict";

const RETARD_MAX_RDV = 30 * 60000;        // ne pas avertir d'un rendez-vous déjà commencé depuis 30 min
const RETARD_MAX_RAPPEL = 6 * 3600000;     // un rappel de tâche manqué depuis plus de 6 h est abandonné

function heureFr(h) {
  if (!h) return "";
  const [H, M] = h.split(":");
  return `${Number(H)} h${M && M !== "00" ? " " + M : ""}`;
}
function quand(date, dateLocale, demainLocal) {
  if (date === dateLocale) return "Aujourd'hui";
  if (date === demainLocal) return "Demain";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}
const nomDe = (personnes, id) => (!id || id === "tous") ? (personnes.length > 2 ? "Tout le monde" : "Les deux") : (personnes.find((p) => p.id === id)?.nom || "");
/** L'appareil doit-il recevoir une notification visant cette personne ? */
const concerne = (appareil, cible) => !cible || cible === "tous" || !appareil.personneId || appareil.personneId === cible;
const pluriel = (n, s, p) => `${n} ${n > 1 ? p : s}`;

function calculerEnvois({ maintenant, dateLocale, demainLocal, heureLocale, heureResume = 7, rendezvous = [], taches = [], personnes = [], appareils = [], reglages = {}, repasDuJour = null }) {
  const envois = [];
  const majs = [];
  const actifs = appareils.filter((a) => a.abonnement && a.abonnement.endpoint);
  const envoyer = (type, cible, payload) => {
    for (const a of actifs) {
      if ((a.prefs || {})[type] === false) continue;
      if (!concerne(a, cible)) continue;
      envois.push({ appareilId: a.id, payload });
    }
  };

  // 1) Rendez-vous
  for (const r of rendezvous) {
    if (r.rappelEnvoye) continue;
    // Rendez-vous Outlook en double d'un rendez-vous FAMILLE : un seul rappel
    if (r.masque) { majs.push({ col: "rendezvous", id: r.id, data: { rappelEnvoye: true } }); continue; }
    if (!r.rappelA) { majs.push({ col: "rendezvous", id: r.id, data: { rappelEnvoye: true } }); continue; }
    if (r.rappelA > maintenant) continue;
    if ((r.debutA || 0) > maintenant - RETARD_MAX_RDV) {
      envoyer("rendezvous", r.personne, {
        titre: `📅 ${r.titre}`,
        corps: [`${quand(r.date, dateLocale, demainLocal)} à ${heureFr(r.heureDebut)}`, r.adresse, nomDe(personnes, r.personne)].filter(Boolean).join(" · "),
        tag: "rdv-" + r.id, url: "./#/agenda"
      });
    }
    majs.push({ col: "rendezvous", id: r.id, data: { rappelEnvoye: true } });
  }

  // 2) Rappels programmés des tâches
  for (const t of taches) {
    if (t.rappelEnvoye) continue;
    if (!t.rappelA || t.statut === "terminee") { majs.push({ col: "taches", id: t.id, data: { rappelEnvoye: true } }); continue; }
    if (t.rappelA > maintenant) continue;
    if (t.rappelA > maintenant - RETARD_MAX_RAPPEL) {
      envoyer("rappels", t.responsable, {
        titre: `🔔 ${t.titre}`,
        corps: [t.echeance ? `Échéance : ${quand(t.echeance, dateLocale, demainLocal).toLowerCase()}${t.heure ? " à " + heureFr(t.heure) : ""}` : "", nomDe(personnes, t.responsable), t.description].filter(Boolean).join(" · "),
        tag: "tache-" + t.id, url: "./#/taches"
      });
    }
    majs.push({ col: "taches", id: t.id, data: { rappelEnvoye: true } });
  }

  // 3) Résumé du matin (une fois par jour) : tâches du jour + tâches en retard
  let resumeEnvoye = false;
  if (heureLocale >= heureResume && reglages.dernierResume !== dateLocale) {
    resumeEnvoye = true;
    const aFaire = taches.filter((t) => t.statut !== "terminee");
    for (const a of actifs) {
      const prefs = a.prefs || {};
      const miennes = aFaire.filter((t) => concerne(a, t.responsable));
      const jour = miennes.filter((t) => t.echeance === dateLocale);
      const retard = miennes.filter((t) => t.echeance && t.echeance < dateLocale);
      if (prefs.taches !== false && (jour.length || repasDuJour)) {
        const lignes = [];
        if (jour.length) lignes.push(`${pluriel(jour.length, "tâche", "tâches")} aujourd'hui : ${jour.slice(0, 3).map((t) => t.titre).join(", ")}${jour.length > 3 ? "…" : ""}`);
        if (repasDuJour) lignes.push(`Souper : ${repasDuJour.nom}`);
        envois.push({ appareilId: a.id, payload: { titre: "☀️ Votre journée", corps: lignes.join(" · "), tag: "resume-" + dateLocale, url: "./#/accueil" } });
      }
      if (prefs.retard !== false && retard.length) {
        envois.push({ appareilId: a.id, payload: {
          titre: `⚠️ ${pluriel(retard.length, "tâche en retard", "tâches en retard")}`,
          corps: retard.slice(0, 3).map((t) => t.titre).join(", ") + (retard.length > 3 ? "…" : ""),
          tag: "retard-" + dateLocale, url: "./#/taches"
        } });
      }
    }
    majs.push({ col: "reglages", id: "general", data: { dernierResume: dateLocale }, fusion: true });
  }

  return { envois, majs, resumeEnvoye };
}

module.exports = { calculerEnvois, heureFr };
