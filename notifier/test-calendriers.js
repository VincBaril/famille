/* Tests de la lecture des calendriers Outlook : node test-calendriers.js */
"use strict";
const assert = require("assert");
const { occurrences, fusionner, planifier, resoudreFuseau } = require("./calendriers");

const FUSEAU = "America/Toronto";
const maintenant = Date.UTC(2026, 10, 12, 19, 0);
const fenetre = { debut: maintenant - 30 * 86400000, fin: maintenant + 120 * 86400000, fuseau: FUSEAU };
let n = 0; const t = (nom, f) => { f(); n++; console.log("✔", nom); };

// Calendrier semblable à ce que publie Outlook.com
const VTZ = `BEGIN:VTIMEZONE
TZID:Eastern Standard Time
BEGIN:STANDARD
DTSTART:16010101T020000
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE`;
const ev = (lignes) => `BEGIN:VEVENT\n${lignes.trim()}\nEND:VEVENT`;
const cal = (...evts) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:Microsoft Exchange Server 2010\r\n${VTZ}\r\n${evts.join("\r\n")}\r\nEND:VCALENDAR\r\n`.replace(/\r?\n/g, "\r\n");

const ICS1 = cal(
  ev(`UID:simple-1
SUMMARY:Dentiste
LOCATION:123\\, rue Principale\\, Plessisville
DTSTART;TZID=Eastern Standard Time:20261120T143000
DTEND;TZID=Eastern Standard Time:20261120T153000
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Rappel
END:VALARM`),
  ev(`UID:hebdo-1
SUMMARY:Cours de natation
DTSTART;TZID=Eastern Standard Time:20261019T090000
DTEND;TZID=Eastern Standard Time:20261019T100000
RRULE:FREQ=WEEKLY;UNTIL=20261202T140000Z;INTERVAL=1;BYDAY=MO,WE;WKST=SU
EXDATE;TZID=Eastern Standard Time:20261104T090000`),
  ev(`UID:hebdo-1
RECURRENCE-ID;TZID=Eastern Standard Time:20261109T090000
SUMMARY:Cours de natation (déplacé)
DTSTART;TZID=Eastern Standard Time:20261110T100000
DTEND;TZID=Eastern Standard Time:20261110T110000`),
  ev(`UID:mensuel-1
SUMMARY:Réunion de parents
DTSTART;TZID=Eastern Standard Time:20260908T190000
DTEND;TZID=Eastern Standard Time:20260908T203000
RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2`),
  ev(`UID:anniv-1
SUMMARY:Anniversaire de Léa
DTSTART;VALUE=DATE:19901225
DTEND;VALUE=DATE:19901226
RRULE:FREQ=YEARLY`),
  ev(`UID:vacances-1
SUMMARY:Vacances
DTSTART;VALUE=DATE:20261223
DTEND;VALUE=DATE:20261227`),
  ev(`UID:annule-1
SUMMARY:Annulé
STATUS:CANCELLED
DTSTART;TZID=Eastern Standard Time:20261125T100000
DTEND;TZID=Eastern Standard Time:20261125T110000`),
  ev(`UID:utc-1
SUMMARY:Appel en UTC
DTSTART:20261115T150000Z
DTEND:20261115T153000Z`),
  ev(`UID:affiche-1
SUMMARY:Garage avec un très long titre qui sera replié sur plusieurs lignes par Out
 look parce que la ligne dépasse soixante-quinze caractères
DTSTART;TZID="(UTC-05:00) Eastern Time (US & Canada)":20261130T080000
DTEND;TZID="(UTC-05:00) Eastern Time (US & Canada)":20261130T090000`),
  ev(`UID:vieux-1
SUMMARY:Trop ancien
DTSTART;TZID=Eastern Standard Time:20250101T080000
DTEND;TZID=Eastern Standard Time:20250101T090000`)
);

const occ = occurrences(ICS1, fenetre);
const par = (uid) => occ.filter((o) => o.uid === uid);

t("fuseaux Windows et libellés Outlook", () => {
  assert.strictEqual(resoudreFuseau("Eastern Standard Time", "UTC"), "America/Toronto");
  assert.strictEqual(resoudreFuseau("(UTC-05:00) Eastern Time (US & Canada)", "UTC"), "America/Toronto");
  assert.strictEqual(resoudreFuseau("Europe/Paris", "UTC"), "Europe/Paris");
  assert.strictEqual(resoudreFuseau("Fuseau inconnu", "America/Toronto"), "America/Toronto");
});

t("rendez-vous simple : heure locale, instant exact, adresse, alarme ignorée", () => {
  const [o] = par("simple-1");
  assert.deepStrictEqual([o.date, o.heureDebut, o.heureFin, o.journee], ["2026-11-20", "14:30", "15:30", false]);
  assert.strictEqual(o.debutA, Date.UTC(2026, 10, 20, 19, 30));
  assert.strictEqual(o.lieu, "123, rue Principale, Plessisville");
});

t("hebdomadaire lundi/mercredi : changement d'heure, exclusion, exception déplacée, fin (UNTIL)", () => {
  const liste = par("hebdo-1").sort((a, b) => a.debutA - b.debutA);
  const dates = liste.map((o) => o.date + " " + o.heureDebut);
  assert.deepStrictEqual(dates, [
    "2026-10-19 09:00", "2026-10-21 09:00", "2026-10-26 09:00", "2026-10-28 09:00",
    "2026-11-02 09:00", /* 4 nov. exclu */ "2026-11-10 10:00", /* 9 nov. déplacé au 10 */ "2026-11-11 09:00",
    "2026-11-16 09:00", "2026-11-18 09:00", "2026-11-23 09:00", "2026-11-25 09:00", "2026-11-30 09:00", "2026-12-02 09:00"
  ]);
  assert.strictEqual(liste[0].debutA, Date.UTC(2026, 9, 19, 13, 0)); // heure avancée (UTC-4)
  assert.strictEqual(liste[4].debutA, Date.UTC(2026, 10, 2, 14, 0)); // heure normale (UTC-5)
  assert.strictEqual(liste[5].titre, "Cours de natation (déplacé)");
});

t("mensuel « 2e mardi » (BYSETPOS d'Outlook)", () => {
  // 2e mardi de chaque mois : 13 oct. (début de la fenêtre), 10 nov., 8 déc., 12 janv., 9 févr., 9 mars
  assert.deepStrictEqual(par("mensuel-1").map((o) => o.date), ["2026-10-13", "2026-11-10", "2026-12-08", "2027-01-12", "2027-02-09", "2027-03-09"]);
  assert.ok(par("mensuel-1").every((o) => o.heureDebut === "19:00" && o.heureFin === "20:30"));
});

t("même règle écrite autrement (BYDAY=2TU)", () => {
  const ics = cal(ev(`UID:m2
SUMMARY:Club
DTSTART;TZID=Eastern Standard Time:20261013T190000
DTEND;TZID=Eastern Standard Time:20261013T200000
RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3`));
  assert.deepStrictEqual(occurrences(ics, fenetre).map((o) => o.date), ["2026-10-13", "2026-11-10", "2026-12-08"]);
});

t("anniversaire annuel (journée entière)", () => {
  const [o] = par("anniv-1");
  assert.deepStrictEqual([o.date, o.journee, o.heureDebut], ["2026-12-25", true, ""]);
  assert.strictEqual(par("anniv-1").length, 1);
});

t("vacances sur plusieurs jours : une entrée par jour (fin exclusive)", () => {
  assert.deepStrictEqual(par("vacances-1").map((o) => o.date), ["2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26"]);
});

t("annulé et trop ancien ignorés ; UTC converti ; titre replié et fuseau en libellé", () => {
  assert.strictEqual(par("annule-1").length, 0);
  assert.strictEqual(par("vieux-1").length, 0);
  assert.strictEqual(par("utc-1")[0].heureDebut, "10:00");
  const g = par("affiche-1")[0];
  assert.match(g.titre, /^Garage avec .* Outlook parce que/);
  assert.strictEqual(g.debutA, Date.UTC(2026, 10, 30, 13, 0));
});

t("lien qui n'est pas un calendrier → aucune occurrence", () => {
  assert.strictEqual(occurrences("<html>Erreur</html>", fenetre).length, 0);
});

t("autres récurrences : aux 2 semaines, le 31 du mois, collecte (journée) chaque jeudi, quotidien depuis 2015", () => {
  const ics = cal(
    ev(`UID:q2
SUMMARY:Garde partagée
DTSTART;TZID=Eastern Standard Time:20261106T170000
DTEND;TZID=Eastern Standard Time:20261106T180000
RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;WKST=SU;COUNT=4`),
    ev(`UID:m31
SUMMARY:Payer le loyer
DTSTART;TZID=Eastern Standard Time:20261031T090000
DTEND;TZID=Eastern Standard Time:20261031T091500
RRULE:FREQ=MONTHLY;BYMONTHDAY=31`),
    ev(`UID:collecte
SUMMARY:Recyclage
DTSTART;VALUE=DATE:20261112
DTEND;VALUE=DATE:20261113
RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261203`),
    ev(`UID:vitamines
SUMMARY:Vitamines
DTSTART;TZID=Eastern Standard Time:20150101T080000
DTEND;TZID=Eastern Standard Time:20150101T080500
RRULE:FREQ=DAILY`)
  );
  const debutChrono = Date.now();
  const res = occurrences(ics, fenetre);
  const de = (uid) => res.filter((o) => o.uid === uid).map((o) => o.date);
  assert.deepStrictEqual(de("q2"), ["2026-11-06", "2026-11-20", "2026-12-04", "2026-12-18"]);
  assert.deepStrictEqual(de("m31"), ["2026-10-31", "2026-12-31", "2027-01-31"]); // pas de 31 nov. ni 31 févr.
  assert.deepStrictEqual(de("collecte"), ["2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03"]);
  assert.strictEqual(de("vitamines").length, 150); // du 14 oct. au 12 mars (fenêtre : -30 j / +120 j)
  assert.ok(Date.now() - debutChrono < 2000, "calcul rapide");
});

/* ---------- Fusion ---------- */
const o = (uid, titre, date, heure, debutA) => ({ uid, titre, lieu: "", journee: false, date, heureDebut: heure, heureFin: "", debutA, finA: debutA + 3600000 });
t("fusion : même invitation (UID) → une entrée « tous »", () => {
  const m = fusionner([
    { personneId: "p1", occurrences: [o("inv-1", "Rencontre école", "2026-11-20", "18:00", 1)] },
    { personneId: "p2", occurrences: [o("inv-1", "Rencontre école", "2026-11-20", "18:00", 1)] }
  ]);
  assert.strictEqual(m.size, 1);
  assert.strictEqual([...m.values()][0].personne, "tous");
});
t("fusion : créés séparément, même titre (casse/accents) et même heure → une entrée", () => {
  const m = fusionner([
    { personneId: "p1", occurrences: [o("a", "Souper chez Éric", "2026-11-21", "17:30", 2)] },
    { personneId: "p2", occurrences: [o("b", "souper chez eric", "2026-11-21", "17:30", 2)] }
  ]);
  assert.strictEqual(m.size, 1);
  assert.deepStrictEqual([...m.values()][0].personnes, ["p1", "p2"]);
});
t("fusion : titres différents → deux entrées, chacune à sa personne", () => {
  const m = fusionner([
    { personneId: "p1", occurrences: [o("a", "Dentiste", "2026-11-22", "09:00", 3)] },
    { personneId: "p2", occurrences: [o("b", "Dentiste – Léa", "2026-11-22", "09:00", 3)] }
  ]);
  assert.deepStrictEqual([...m.values()].map((x) => x.personne).sort(), ["p1", "p2"]);
});

/* ---------- Écritures ---------- */
t("planification : création, inchangé, modifié, supprimé, masqué, rappel", () => {
  const H = 3600000;
  const voulus = fusionner([{ personneId: "p1", occurrences: [
    o("x", "Dentiste", "2026-11-20", "14:30", maintenant + 48 * H),
    o("y", "Garage", "2026-11-21", "08:00", maintenant + 60 * H),
    o("z", "Coiffeur", "2026-11-12", "13:00", maintenant - H)
  ] }]);
  const ids = [...voulus.keys()];
  const p1 = planifier({ voulus, existants: [
    { id: "manuel", source: undefined, titre: "garage", date: "2026-11-21", heureDebut: "08:00" },
    { id: "outlook-disparu", source: "outlook", date: "2026-11-25" },
    { id: "outlook-ancien", source: "outlook", date: "2026-09-01" }
  ], maintenant, rappelMin: 60, dateDebutFenetre: "2026-10-13" });
  assert.strictEqual(p1.ecritures.length, 3);
  const dent = p1.ecritures.find((e) => e.id === ids[0]).data;
  assert.strictEqual(dent.rappelA, maintenant + 47 * H);
  assert.strictEqual(dent.rappelEnvoye, false);
  assert.strictEqual(p1.ecritures.find((e) => e.id === ids[1]).data.masque, true, "doublon d'un rendez-vous FAMILLE");
  assert.strictEqual(p1.ecritures.find((e) => e.id === ids[2]).data.rappelEnvoye, true, "déjà commencé");
  assert.deepStrictEqual(p1.suppressions, ["outlook-disparu"], "l'ancien hors fenêtre est conservé");

  // Deuxième passage : rien n'a changé → aucune écriture
  const existants = p1.ecritures.map((e) => ({ id: e.id, ...e.data, rappelEnvoye: e.id === ids[0] ? true : e.data.rappelEnvoye }));
  existants.push({ id: "manuel", titre: "garage", date: "2026-11-21", heureDebut: "08:00" });
  const p2 = planifier({ voulus, existants, maintenant, rappelMin: 60, dateDebutFenetre: "2026-10-13" });
  assert.strictEqual(p2.ecritures.length, 0);
  assert.strictEqual(p2.suppressions.length, 0);

  // Le dentiste est déplacé d'une heure → mise à jour, rappel réarmé
  const voulus3 = new Map(voulus);
  voulus3.set(ids[0], { ...voulus.get(ids[0]), debutA: maintenant + 49 * H, finA: maintenant + 50 * H, heureDebut: "15:30" });
  const p3 = planifier({ voulus: voulus3, existants, maintenant, rappelMin: 60, dateDebutFenetre: "2026-10-13" });
  assert.strictEqual(p3.ecritures.length, 1);
  assert.strictEqual(p3.ecritures[0].data.rappelEnvoye, false);
  assert.strictEqual(p3.ecritures[0].fusion, true);
});

console.log(`\n${n} tests réussis`);
