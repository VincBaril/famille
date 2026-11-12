/* =========================================================
   Calendriers Outlook → FAMILLE (lecture seule)
   - Lit un calendrier publié au format ICS (lien secret Outlook)
   - Calcule les rendez-vous, y compris les rendez-vous récurrents,
     les exceptions et les changements d'heure
   - Fusionne un même rendez-vous présent dans les deux calendriers
   - Prépare les écritures dans la base (sans y toucher : testable)
   Aucune dépendance externe.
   ========================================================= */
"use strict";
const crypto = require("crypto");

const JOUR = 86400000;

/* ---------------- Normalisation (identique à l'application) ---------------- */
const MOTS_VIDES = new Set(["de", "des", "du", "la", "le", "les", "d", "l", "un", "une", "au", "aux", "en", "a", "et"]);
function normaliser(t) {
  return String(t || "")
    .toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ")
    .filter((m) => m && !MOTS_VIDES.has(m))
    .map((m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m))
    .join(" ");
}

/* ---------------- Fuseaux horaires ---------------- */
const WINDOWS_IANA = {
  "eastern standard time": "America/Toronto", "us eastern standard time": "America/Indiana/Indianapolis",
  "central standard time": "America/Chicago", "canada central standard time": "America/Regina",
  "mountain standard time": "America/Edmonton", "us mountain standard time": "America/Phoenix",
  "pacific standard time": "America/Vancouver", "atlantic standard time": "America/Halifax",
  "newfoundland standard time": "America/St_Johns", "alaskan standard time": "America/Anchorage",
  "hawaiian standard time": "Pacific/Honolulu", "central standard time (mexico)": "America/Mexico_City",
  "mexico standard time": "America/Mexico_City", "sa pacific standard time": "America/Bogota",
  "cuba standard time": "America/Havana", "haiti standard time": "America/Port-au-Prince",
  "e. south america standard time": "America/Sao_Paulo", "sa eastern standard time": "America/Cayenne",
  "gmt standard time": "Europe/London", "greenwich standard time": "Atlantic/Reykjavik",
  "romance standard time": "Europe/Paris", "w. europe standard time": "Europe/Berlin",
  "central europe standard time": "Europe/Budapest", "central european standard time": "Europe/Warsaw",
  "e. europe standard time": "Europe/Chisinau", "fle standard time": "Europe/Kiev", "gtb standard time": "Europe/Bucharest",
  "morocco standard time": "Africa/Casablanca", "w. central africa standard time": "Africa/Lagos",
  "tokyo standard time": "Asia/Tokyo", "china standard time": "Asia/Shanghai", "india standard time": "Asia/Kolkata",
  "se asia standard time": "Asia/Bangkok", "aus eastern standard time": "Australia/Sydney",
  "utc": "UTC", "coordinated universal time": "UTC", "gmt": "UTC"
};
const MOTS_CLES_FUSEAU = [
  [/eastern time/i, "America/Toronto"], [/central time/i, "America/Chicago"], [/saskatchewan/i, "America/Regina"],
  [/mountain time/i, "America/Edmonton"], [/pacific time/i, "America/Vancouver"], [/atlantic time/i, "America/Halifax"],
  [/newfoundland/i, "America/St_Johns"], [/paris|brussels|bruxelles|madrid|copenhagen/i, "Europe/Paris"],
  [/london|dublin|lisbon/i, "Europe/London"], [/amsterdam|berlin|rome|stockholm|vienna/i, "Europe/Berlin"],
  [/coordinated universal time|^\(utc\)/i, "UTC"]
];
const ianaValide = (z) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } };

function resoudreFuseau(tzid, defaut) {
  if (!tzid) return defaut;
  const t = String(tzid).replace(/^"|"$/g, "").trim();
  const m = WINDOWS_IANA[t.toLowerCase()];
  if (m) return m;
  if (/^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(t) && ianaValide(t)) return t;
  for (const [re, z] of MOTS_CLES_FUSEAU) if (re.test(t)) return z;
  return defaut;
}

/** Décalage (ms) du fuseau à un instant donné */
function decalage(fuseau, instant) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instant / 1000) * 1000;
}
/** Heure « murale » (exprimée en ms naïfs) dans un fuseau → instant réel */
function versInstant(naif, fuseau) {
  let t = naif - decalage(fuseau, naif);
  t = naif - decalage(fuseau, t);
  return t;
}
/** Instant réel → date et heure locales */
function localDe(instant, fuseau) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, heure: `${p.hour}:${p.minute}` };
}
const isoNaif = (n) => new Date(n).toISOString().slice(0, 10);

/* ---------------- Lecture du fichier ICS ---------------- */
function deplier(texte) {
  return String(texte).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}
function lireLigne(ligne) {
  // NOM;PARAM=val;PARAM="v:al":VALEUR
  let i = 0, guillemets = false;
  for (; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') guillemets = !guillemets;
    else if (c === ":" && !guillemets) break;
  }
  const tete = ligne.slice(0, i), valeur = ligne.slice(i + 1);
  const morceaux = tete.match(/("[^"]*"|[^;])+/g) || [""];
  const nom = morceaux[0].toUpperCase();
  const params = {};
  for (const m of morceaux.slice(1)) {
    const k = m.indexOf("=");
    if (k > 0) params[m.slice(0, k).toUpperCase()] = m.slice(k + 1).replace(/^"|"$/g, "");
  }
  return { nom, params, valeur };
}
const texteIcs = (v) => String(v || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** Analyse une valeur de date ICS → { naif (ms), journee, utc, fuseau } */
function lireDate(valeur, params, defautFuseau) {
  const v = String(valeur).trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m || params.VALUE === "DATE") {
    m = m || v.match(/^(\d{4})(\d{2})(\d{2})/);
    return { naif: Date.UTC(+m[1], +m[2] - 1, +m[3]), journee: true };
  }
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
  if (!m) return null;
  const naif = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) return { naif, journee: false, utc: true, fuseau: "UTC" };
  return { naif, journee: false, utc: false, fuseau: resoudreFuseau(params.TZID, defautFuseau) };
}
const instantDe = (d) => (d.journee ? d.naif : d.utc ? d.naif : versInstant(d.naif, d.fuseau));

function lireDuree(v) {
  const m = String(v || "").match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * JOUR) + ((+m[3] || 0) * JOUR) + ((+m[4] || 0) * 3600000) + ((+m[5] || 0) * 60000) + ((+m[6] || 0) * 1000);
  return m[1] === "-" ? -ms : ms;
}

function lireRegle(v) {
  const r = {};
  for (const morceau of String(v).split(";")) {
    const [k, val] = morceau.split("=");
    if (k && val !== undefined) r[k.toUpperCase()] = val;
  }
  const liste = (k) => (r[k] ? r[k].split(",").map((x) => x.trim()).filter(Boolean) : null);
  const JOURS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  return {
    freq: (r.FREQ || "").toUpperCase(),
    intervalle: Math.max(1, +r.INTERVAL || 1),
    count: r.COUNT ? +r.COUNT : null,
    until: r.UNTIL || null,
    byday: liste("BYDAY")?.map((x) => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/i); return m ? { n: m[1] ? +m[1] : 0, j: JOURS[m[2].toUpperCase()] } : null; }).filter((x) => x && x.j !== undefined) || null,
    bymonthday: liste("BYMONTHDAY")?.map(Number) || null,
    bymonth: liste("BYMONTH")?.map(Number) || null,
    bysetpos: liste("BYSETPOS")?.map(Number) || null,
    wkst: JOURS[(r.WKST || "MO").toUpperCase()] ?? 1
  };
}

/** Extrait les événements bruts d'un fichier ICS */
function lireIcs(texte, defautFuseau) {
  const evenements = [];
  let courant = null, profondeur = 0;
  for (const ligne of deplier(texte)) {
    if (!ligne) continue;
    const l = lireLigne(ligne);
    if (l.nom === "BEGIN" && l.valeur.toUpperCase() === "VEVENT") { courant = { exdates: [] }; profondeur = 0; continue; }
    if (!courant) continue;
    if (l.nom === "BEGIN") { profondeur++; continue; }          // VALARM, etc.
    if (l.nom === "END" && l.valeur.toUpperCase() === "VEVENT") { evenements.push(courant); courant = null; continue; }
    if (l.nom === "END") { profondeur--; continue; }
    if (profondeur > 0) continue;
    switch (l.nom) {
      case "UID": courant.uid = l.valeur.trim(); break;
      case "SUMMARY": courant.titre = texteIcs(l.valeur); break;
      case "LOCATION": courant.lieu = texteIcs(l.valeur); break;
      case "STATUS": courant.statut = l.valeur.trim().toUpperCase(); break;
      case "DTSTART": courant.debut = lireDate(l.valeur, l.params, defautFuseau); break;
      case "DTEND": courant.fin = lireDate(l.valeur, l.params, defautFuseau); break;
      case "DURATION": courant.duree = lireDuree(l.valeur); break;
      case "RRULE": courant.regle = lireRegle(l.valeur); break;
      case "RECURRENCE-ID": courant.recurrenceId = lireDate(l.valeur, l.params, defautFuseau); break;
      case "EXDATE":
        for (const v of l.valeur.split(",")) { const d = lireDate(v, l.params, defautFuseau); if (d) courant.exdates.push(d); }
        break;
    }
  }
  return evenements.filter((e) => e.debut);
}

/* ---------------- Récurrences (RFC 5545, cas courants d'Outlook) ---------------- */
const jourSem = (naif) => new Date(naif).getUTCDay();
const joursDansMois = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();

function joursAvecRang(a, m, byday) {
  // Jours d'un mois correspondant à BYDAY (avec rang éventuel : 2TU, -1FR)
  const n = joursDansMois(a, m), res = [];
  for (const { n: rang, j } of byday) {
    const liste = [];
    for (let d = 1; d <= n; d++) if (new Date(Date.UTC(a, m, d)).getUTCDay() === j) liste.push(d);
    if (!rang) res.push(...liste);
    else { const d = rang > 0 ? liste[rang - 1] : liste[liste.length + rang]; if (d) res.push(d); }
  }
  return res;
}
function joursDuMois(a, m, regle, jourDefaut) {
  const n = joursDansMois(a, m);
  let jours = null;
  if (regle.bymonthday) jours = regle.bymonthday.map((d) => (d < 0 ? n + d + 1 : d)).filter((d) => d >= 1 && d <= n);
  if (regle.byday) {
    const parJour = joursAvecRang(a, m, regle.byday);
    jours = jours ? jours.filter((d) => parJour.includes(d)) : parJour;
  }
  if (!jours) jours = jourDefaut <= n ? [jourDefaut] : [];
  return [...new Set(jours)].sort((x, y) => x - y);
}
function appliquerSetpos(liste, setpos) {
  if (!setpos) return liste;
  const res = [];
  for (const p of setpos) { const v = p > 0 ? liste[p - 1] : liste[liste.length + p]; if (v !== undefined) res.push(v); }
  return [...new Set(res)].sort((a, b) => a - b);
}

/**
 * Génère les débuts (ms naïfs) d'un événement récurrent.
 * @param arreter(naif) → true quand on dépasse la fenêtre voulue
 */
function* debutsRecurrents(debutNaif, regle, finJusqua, arreter) {
  const d0 = new Date(debutNaif);
  const a0 = d0.getUTCFullYear(), m0 = d0.getUTCMonth(), j0 = d0.getUTCDate();
  const heure = debutNaif - Date.UTC(a0, m0, j0);
  let produits = 0;
  const emettre = function* (liste) {
    for (const n of liste) {
      if (n < debutNaif) continue;
      if (regle.bymonth && !regle.bymonth.includes(new Date(n).getUTCMonth() + 1)) continue;
      if (finJusqua !== null && n > finJusqua) return "fin";
      if (regle.count !== null && produits >= regle.count) return "fin";
      produits++;
      yield n;
    }
  };
  for (let i = 0; i < 20000; i++) {
    let candidats = [];
    if (regle.freq === "DAILY") {
      const n = debutNaif + i * regle.intervalle * JOUR;
      const dd = new Date(n);
      if (regle.byday && !regle.byday.some((b) => b.j === dd.getUTCDay())) candidats = [];
      else if (regle.bymonthday && !regle.bymonthday.includes(dd.getUTCDate())) candidats = [];
      else candidats = [n];
      if (arreter(n)) return;
    } else if (regle.freq === "WEEKLY") {
      const decal = (jourSem(debutNaif) - regle.wkst + 7) % 7;
      const debutSemaine = Date.UTC(a0, m0, j0 - decal) + i * regle.intervalle * 7 * JOUR;
      if (arreter(debutSemaine)) return;
      const jours = regle.byday ? regle.byday.map((b) => b.j) : [jourSem(debutNaif)];
      candidats = jours.map((j) => debutSemaine + ((j - regle.wkst + 7) % 7) * JOUR + heure).sort((x, y) => x - y);
    } else if (regle.freq === "MONTHLY") {
      const total = m0 + i * regle.intervalle;
      const a = a0 + Math.floor(total / 12), m = ((total % 12) + 12) % 12;
      if (arreter(Date.UTC(a, m, 1))) return;
      const jours = appliquerSetpos(joursDuMois(a, m, regle, j0), regle.bysetpos);
      candidats = jours.map((d) => Date.UTC(a, m, d) + heure);
    } else if (regle.freq === "YEARLY") {
      const a = a0 + i * regle.intervalle;
      if (arreter(Date.UTC(a, 0, 1))) return;
      const mois = regle.bymonth ? regle.bymonth.map((x) => x - 1) : [m0];
      let jours = [];
      for (const m of mois) {
        const r = (regle.byday || regle.bymonthday) ? regle : { ...regle, bymonthday: [j0] };
        jours.push(...joursDuMois(a, m, r, j0).map((d) => Date.UTC(a, m, d)));
      }
      jours.sort((x, y) => x - y);
      candidats = appliquerSetpos(jours, regle.bysetpos).map((n) => n + heure);
    } else {
      yield debutNaif; return;
    }
    const r = yield* emettre(candidats);
    if (r === "fin") return;
  }
}

/**
 * Occurrences d'un calendrier entre deux instants.
 * Retourne [{ uid, titre, lieu, journee, date, heureDebut, heureFin, debutA, finA }]
 */
function occurrences(texteIcsCal, { debut, fin, fuseau }) {
  const evts = lireIcs(texteIcsCal, fuseau);
  const exceptions = new Map(); // uid -> [événements RECURRENCE-ID]
  for (const e of evts) if (e.recurrenceId) {
    if (!exceptions.has(e.uid)) exceptions.set(e.uid, []);
    exceptions.get(e.uid).push(e);
  }
  const res = [];
  const ajouter = (e, debutDate, debutInstant) => {
    if (e.statut === "CANCELLED") return;
    const titre = e.titre || "(Sans titre)";
    if (e.debut.journee) {
      let nbJours = 1;
      if (e.fin && e.fin.journee) nbJours = Math.round((e.fin.naif - e.debut.naif) / JOUR);
      else if (e.duree) nbJours = Math.round(e.duree / JOUR);
      nbJours = Math.min(Math.max(nbJours, 1), 31);
      for (let k = 0; k < nbJours; k++) {
        const date = isoNaif(debutDate + k * JOUR);
        const debutJour = versInstant(debutDate + k * JOUR, fuseau);
        const finJour = versInstant(debutDate + (k + 1) * JOUR, fuseau) - 1000;
        if (finJour < debut || debutJour > fin) continue;
        res.push({ uid: e.uid || "", titre, lieu: e.lieu || "", journee: true, date, heureDebut: "", heureFin: "", debutA: debutJour, finA: finJour });
      }
      return;
    }
    let duree = 0;
    if (e.fin && !e.fin.journee) duree = instantDe(e.fin) - instantDe(e.debut);
    else if (e.duree) duree = e.duree;
    duree = Math.max(0, duree);
    const finInstant = debutInstant + duree;
    if (finInstant < debut || debutInstant > fin) return;
    const l1 = localDe(debutInstant, fuseau), l2 = localDe(finInstant, fuseau);
    res.push({
      uid: e.uid || "", titre, lieu: e.lieu || "", journee: false, date: l1.date, heureDebut: l1.heure,
      heureFin: duree > 0 ? (l2.date === l1.date ? l2.heure : "23:59") : "",
      debutA: debutInstant, finA: duree > 0 ? finInstant : debutInstant + 3600000
    });
  };

  for (const e of evts) {
    if (e.recurrenceId) continue;
    if (!e.regle) { ajouter(e, e.debut.naif, instantDe(e.debut)); continue; }
    // Récurrent
    const exc = exceptions.get(e.uid) || [];
    const exclus = new Set([...e.exdates, ...exc.map((x) => x.recurrenceId)].map((d) => (d.journee ? "J" + isoNaif(d.naif) : "T" + instantDe(d))));
    const fuseauEvt = e.debut.journee ? fuseau : e.debut.fuseau;
    let finJusqua = null;
    if (e.regle.until) {
      const u = lireDate(e.regle.until, {}, fuseauEvt);
      if (u) {
        if (e.debut.journee) finJusqua = u.journee ? u.naif : Date.UTC(new Date(u.naif).getUTCFullYear(), new Date(u.naif).getUTCMonth(), new Date(u.naif).getUTCDate());
        else if (u.journee) finJusqua = u.naif + JOUR - 1;
        else {
          const uInstant = instantDe(u);
          finJusqua = uInstant + decalage(fuseauEvt, uInstant); // en ms naïfs du fuseau de l'événement
        }
      }
    }
    const marge = 2 * JOUR + (e.debut.journee ? 31 * JOUR : 0);
    const arreter = (naif) => naif - 2 * JOUR > fin + marge;
    for (const n of debutsRecurrents(e.debut.naif, e.regle, finJusqua, arreter)) {
      const inst = e.debut.journee ? n : e.debut.utc ? n : versInstant(n, fuseauEvt);
      if (exclus.has(e.debut.journee ? "J" + isoNaif(n) : "T" + inst)) continue;
      if (inst > fin + JOUR) break;
      ajouter(e, n, inst);
    }
    for (const x of exc) ajouter({ ...x, uid: e.uid, titre: x.titre ?? e.titre, lieu: x.lieu ?? e.lieu }, x.debut.naif, instantDe(x.debut));
  }
  return res;
}

/* ---------------- Fusion des calendriers ---------------- */
const cleTitre = (o) => `${normaliser(o.titre)}|${o.date}|${o.journee ? "journee" : o.heureDebut}`;
const idDe = (cle) => "outlook-" + crypto.createHash("sha1").update(cle).digest("hex").slice(0, 24);

/**
 * @param parPersonne  [{ personneId, occurrences: [...] }] dans l'ordre (personne 1 d'abord)
 * @returns Map id -> rendez-vous fusionné
 */
function fusionner(parPersonne) {
  const groupes = [];
  const parUid = new Map(), parTitre = new Map();
  for (const { personneId, occurrences: liste } of parPersonne) {
    for (const o of liste) {
      const kUid = o.uid ? `${o.uid}|${o.journee ? o.date : o.debutA}` : null;
      const kTitre = cleTitre(o);
      let g = (kUid && parUid.get(kUid)) || parTitre.get(kTitre);
      if (!g) { g = { cle: kTitre, occ: o, personnes: new Set() }; groupes.push(g); }
      g.personnes.add(personneId);
      if (!g.occ.lieu && o.lieu) g.occ = { ...g.occ, lieu: o.lieu };
      if (kUid) parUid.set(kUid, g);
      parTitre.set(kTitre, g);
    }
  }
  const res = new Map();
  for (const g of groupes) {
    const personnes = [...g.personnes].sort();
    res.set(idDe(g.cle), {
      cle: g.cle, titre: g.occ.titre, adresse: g.occ.lieu, journee: g.occ.journee, date: g.occ.date,
      heureDebut: g.occ.heureDebut, heureFin: g.occ.heureFin, debutA: g.occ.debutA, finA: g.occ.finA,
      personnes, personne: personnes.length > 1 ? "tous" : personnes[0]
    });
  }
  return res;
}

/* ---------------- Préparation des écritures ---------------- */
const CHAMPS = ["titre", "adresse", "journee", "date", "heureDebut", "heureFin", "debutA", "finA", "personne", "masque", "rappelA", "rappel"];
const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * @param voulus     Map id -> rendez-vous fusionné (fusionner)
 * @param existants  rendez-vous de la base dans la fenêtre (FAMILLE + Outlook)
 * @returns { ecritures: [{id, data, fusion}], suppressions: [id] }
 */
function planifier({ voulus, existants, maintenant, rappelMin, dateDebutFenetre }) {
  const manuels = new Set(existants.filter((r) => r.source !== "outlook" && r.date).map((r) => cleTitre({ titre: r.titre, date: r.date, journee: !r.heureDebut, heureDebut: r.heureDebut })));
  const actuels = new Map(existants.filter((r) => r.source === "outlook").map((r) => [r.id, r]));
  const ecritures = [], suppressions = [];
  // Pas de rappel si le rendez-vous est déjà commencé. S'il vient d'être découvert (ou déplacé)
  // et que l'heure du rappel est passée mais pas celle du rendez-vous, le rappel part tout de suite.
  const dejaPasse = (d) => !d.rappelA || d.debutA <= maintenant;
  for (const [id, v] of voulus) {
    const rappel = v.journee || rappelMin === null ? null : rappelMin;
    const rappelA = rappel === null ? null : v.debutA - rappel * 60000;
    const doc = {
      source: "outlook", titre: v.titre, description: "", adresse: v.adresse || "", notes: "", important: false,
      journee: v.journee, date: v.date, heureDebut: v.heureDebut, heureFin: v.heureFin, debutA: v.debutA, finA: v.finA,
      personne: v.personne, personnes: v.personnes, masque: manuels.has(v.cle), rappel, rappelA
    };
    const ex = actuels.get(id);
    if (!ex) {
      ecritures.push({ id, data: { ...doc, rappelEnvoye: dejaPasse(doc), creeLe: maintenant, modifieLe: maintenant }, fusion: false });
      continue;
    }
    if (CHAMPS.every((c) => egal(ex[c], doc[c])) && egal(ex.personnes, doc.personnes)) continue;
    const data = { ...doc, modifieLe: maintenant };
    if (!egal(ex.rappelA, rappelA)) data.rappelEnvoye = dejaPasse(doc);
    ecritures.push({ id, data, fusion: true });
  }
  for (const [id, r] of actuels) if (!voulus.has(id) && r.date >= dateDebutFenetre) suppressions.push(id);
  return { ecritures, suppressions };
}

module.exports = { occurrences, fusionner, planifier, lireIcs, resoudreFuseau, versInstant, localDe, normaliser };
