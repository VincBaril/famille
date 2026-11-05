/* Éléments d'interface partagés entre les modules */
import { esc } from "../utils.js";
import { personnes, nomResponsable, couleurResponsable, libelleTous, moi } from "../etat.js";

export function pucePersonne(id) {
  return `<span class="puce personne" style="background:${couleurResponsable(id)}">${esc(nomResponsable(id))}</span>`;
}

/** Boutons radio « personne responsable » (une personne ou toutes) */
export function choixPersonne(nom, valeur, { avecTous = true } = {}) {
  const v = valeur || moi() || "tous";
  const options = personnes().map((p) => ({ id: p.id, nom: p.nom }));
  if (avecTous) options.push({ id: "tous", nom: libelleTous() });
  return `<div class="choix">${options.map((o) => `
    <label><input type="radio" name="${nom}" value="${o.id}" ${o.id === v ? "checked" : ""}><span>${esc(o.nom)}</span></label>`).join("")}
  </div>`;
}

export const RAPPELS_RDV = [
  { v: "", l: "Aucun rappel" },
  { v: "15", l: "15 minutes avant" },
  { v: "30", l: "30 minutes avant" },
  { v: "60", l: "1 heure avant" },
  { v: "1440", l: "1 journée avant" }
];
export const RAPPELS_TACHE = [
  { v: "", l: "Aucun rappel" },
  { v: "0", l: "À l'heure prévue" },
  { v: "15", l: "15 minutes avant" },
  { v: "30", l: "30 minutes avant" },
  { v: "60", l: "1 heure avant" },
  { v: "1440", l: "1 journée avant" }
];
export function selectRappel(nom, liste, valeur) {
  const v = valeur === null || valeur === undefined ? "" : String(valeur);
  return `<select name="${nom}">${liste.map((o) => `<option value="${o.v}" ${o.v === v ? "selected" : ""}>${o.l}</option>`).join("")}</select>`;
}
export const libelleRappel = (liste, v) => liste.find((o) => o.v === String(v ?? ""))?.l || "";

/** Filtre « personne » (puces horizontales) */
export function pucesPersonnes(actif, attribut = "data-filtre-personne") {
  const opts = [{ id: "tous", nom: "Tout le monde" }, ...personnes()];
  return `<div class="puces">${opts.map((p) => `<button type="button" class="puce-filtre ${p.id === actif ? "actif" : ""}" ${attribut}="${p.id}">${esc(p.nom)}</button>`).join("")}</div>`;
}
