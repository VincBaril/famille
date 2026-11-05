/* Tests de la logique des rappels : node test-logique.js */
"use strict";
const assert = require("assert");
const { calculerEnvois, heureFr } = require("./logique");

const H = 3600000, M = 60000;
const maintenant = Date.UTC(2026, 10, 5, 12, 0); // 5 nov. 2026, 7 h à Toronto
const base = { maintenant, dateLocale: "2026-11-05", demainLocal: "2026-11-06", heureLocale: 7, heureResume: 7,
  personnes: [{ id: "p1", nom: "Marie" }, { id: "p2", nom: "Luc" }],
  appareils: [
    { id: "a1", personneId: "p1", abonnement: { endpoint: "x1" }, prefs: { rendezvous: true, taches: true, retard: true, rappels: true } },
    { id: "a2", personneId: "p2", abonnement: { endpoint: "x2" }, prefs: { rendezvous: true, taches: false, retard: true, rappels: true } }
  ] };
let n = 0; const t = (nom, f) => { f(); n++; console.log("✔", nom); };

t("heure en français", () => { assert.strictEqual(heureFr("14:30"), "14 h 30"); assert.strictEqual(heureFr("09:00"), "9 h"); });

t("rendez-vous dû → envoyé aux deux (personne = tous) et marqué", () => {
  const r = calculerEnvois({ ...base, reglages: { dernierResume: "2026-11-05" }, rendezvous: [
    { id: "r1", titre: "Dentiste", date: "2026-11-06", heureDebut: "14:30", personne: "tous", rappelA: maintenant - M, debutA: maintenant + 30 * H, rappelEnvoye: false }] });
  assert.strictEqual(r.envois.length, 2);
  assert.match(r.envois[0].payload.corps, /Demain à 14 h 30/);
  assert.deepStrictEqual(r.majs, [{ col: "rendezvous", id: "r1", data: { rappelEnvoye: true } }]);
});

t("rendez-vous futur → rien", () => {
  const r = calculerEnvois({ ...base, reglages: { dernierResume: "2026-11-05" }, rendezvous: [
    { id: "r1", titre: "X", date: "2026-11-07", heureDebut: "10:00", personne: "p1", rappelA: maintenant + H, debutA: maintenant + 2 * H, rappelEnvoye: false }] });
  assert.strictEqual(r.envois.length, 0); assert.strictEqual(r.majs.length, 0);
});

t("rendez-vous ciblé sur p2 → seulement l'appareil de p2", () => {
  const r = calculerEnvois({ ...base, reglages: { dernierResume: "2026-11-05" }, rendezvous: [
    { id: "r1", titre: "Garage", date: "2026-11-05", heureDebut: "08:00", personne: "p2", rappelA: maintenant - M, debutA: maintenant + H, rappelEnvoye: false }] });
  assert.deepStrictEqual(r.envois.map((e) => e.appareilId), ["a2"]);
});

t("rendez-vous passé depuis longtemps → marqué sans envoi", () => {
  const r = calculerEnvois({ ...base, reglages: { dernierResume: "2026-11-05" }, rendezvous: [
    { id: "r1", titre: "Vieux", date: "2026-11-01", heureDebut: "08:00", personne: "tous", rappelA: maintenant - 5 * 24 * H, debutA: maintenant - 4 * 24 * H, rappelEnvoye: false }] });
  assert.strictEqual(r.envois.length, 0); assert.strictEqual(r.majs.length, 1);
});

t("rappel de tâche + préférence désactivée respectée", () => {
  const appareils = base.appareils.map((a) => a.id === "a1" ? { ...a, prefs: { ...a.prefs, rappels: false } } : a);
  const r = calculerEnvois({ ...base, appareils, reglages: { dernierResume: "2026-11-05" }, taches: [
    { id: "t1", titre: "Poubelles", responsable: "tous", statut: "a_faire", echeance: "2026-11-05", heure: "19:00", rappelA: maintenant - M, rappelEnvoye: false }] });
  assert.deepStrictEqual(r.envois.map((e) => e.appareilId), ["a2"]);
});

t("tâche terminée → pas de rappel, marquée", () => {
  const r = calculerEnvois({ ...base, reglages: { dernierResume: "2026-11-05" }, taches: [
    { id: "t1", titre: "X", responsable: "p1", statut: "terminee", rappelA: maintenant - M, rappelEnvoye: false }] });
  assert.strictEqual(r.envois.length, 0); assert.strictEqual(r.majs[0].data.rappelEnvoye, true);
});

t("résumé du matin : tâches du jour, retard, souper ; une seule fois par jour", () => {
  const taches = [
    { id: "t1", titre: "Lavage", responsable: "p1", statut: "a_faire", echeance: "2026-11-05", rappelEnvoye: true },
    { id: "t2", titre: "Facture", responsable: "tous", statut: "a_faire", echeance: "2026-11-01", rappelEnvoye: true }
  ];
  const r = calculerEnvois({ ...base, reglages: {}, taches, repasDuJour: { nom: "Spaghetti" } });
  const a1 = r.envois.filter((e) => e.appareilId === "a1").map((e) => e.payload.titre);
  const a2 = r.envois.filter((e) => e.appareilId === "a2").map((e) => e.payload.titre);
  assert.deepStrictEqual(a1, ["☀️ Votre journée", "⚠️ 1 tâche en retard"]);
  assert.deepStrictEqual(a2, ["⚠️ 1 tâche en retard"]); // résumé désactivé pour a2
  assert.match(r.envois[0].payload.corps, /Souper : Spaghetti/);
  assert.ok(r.majs.some((m) => m.col === "reglages" && m.data.dernierResume === "2026-11-05"));
  const r2 = calculerEnvois({ ...base, reglages: { dernierResume: "2026-11-05" }, taches });
  assert.strictEqual(r2.envois.length, 0);
});

t("avant l'heure du résumé → pas de résumé", () => {
  const r = calculerEnvois({ ...base, heureLocale: 6, reglages: {}, taches: [{ id: "t", titre: "X", responsable: "tous", statut: "a_faire", echeance: "2026-11-05" }] });
  assert.strictEqual(r.envois.length, 0);
});

console.log(`\n${n} tests réussis`);
