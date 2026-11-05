/* =========================================================
   État partagé de l'application
   Écoute en temps réel toutes les collections du foyer et
   prévient l'interface à chaque changement (local ou venant
   de l'autre téléphone).
   ========================================================= */
export const COLLECTIONS = ["epicerie", "taches", "repas", "recettes", "rendezvous", "notes", "personnes", "reglages"];

export const etat = {
  epicerie: [], taches: [], historique: [], repas: [], recettes: [], rendezvous: [], notes: [], personnes: [], reglages: [],
  pret: new Set()
};

let backend = null;
const abonnes = new Set();
const desabonnements = [];
let minuterie = null;

export const db = () => backend;

export function surChangement(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function notifier(col) {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => abonnes.forEach((fn) => fn(col)), 16);
}

export function demarrer(b) {
  backend = b;
  arreter();
  for (const col of COLLECTIONS) {
    desabonnements.push(b.ecouter(col, (docs, meta) => {
      etat[col] = docs;
      etat.pret.add(col);
      if (col === "personnes" && !meta?.depuisCache) initialiserPersonnes(docs);
      notifier(col);
    }));
  }
  // L'historique peut grandir : on charge les 500 dernières entrées
  desabonnements.push(b.ecouter("historique", (docs) => {
    etat.historique = docs; etat.pret.add("historique"); notifier("historique");
  }, { ordre: "realiseeLe", sens: "desc", limite: 500 }));
}

export function arreter() {
  while (desabonnements.length) { try { desabonnements.pop()(); } catch { /* ignore */ } }
}

/* ---------- Personnes ---------- */
export const COULEURS = ["#5E8C6A", "#C0794F", "#5B7FA6", "#9B6BA8", "#B8954A", "#4E9A9A"];
function initialiserPersonnes(docs) {
  // Identifiants fixes : si les deux téléphones le font en même temps, aucun doublon.
  if (docs.length) return;
  backend.definir("personnes", "p1", { nom: "Personne 1", couleur: COULEURS[0], ordre: 1 }, { fusion: true });
  backend.definir("personnes", "p2", { nom: "Personne 2", couleur: COULEURS[1], ordre: 2 }, { fusion: true });
}
export const personnes = () => [...etat.personnes].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
export const personne = (id) => etat.personnes.find((p) => p.id === id);
export const libelleTous = () => (etat.personnes.length > 2 ? "Tout le monde" : "Les deux");
export function nomResponsable(id) {
  if (!id || id === "tous") return libelleTous();
  return personne(id)?.nom || "—";
}
export function couleurResponsable(id) {
  if (!id || id === "tous") return "#7A8A7E";
  return personne(id)?.couleur || "#7A8A7E";
}

/* ---------- Qui utilise ce téléphone ---------- */
const CLE_MOI = "famille:moi";
export function moi() { try { return localStorage.getItem(CLE_MOI); } catch { return null; } }
export function definirMoi(id) { try { localStorage.setItem(CLE_MOI, id); } catch { /* ignore */ } }

/* ---------- Réglages communs ---------- */
export const reglagesGeneraux = () => etat.reglages.find((r) => r.id === "general") || {};
