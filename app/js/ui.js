/* Composants d'interface : feuilles (fenêtres), confirmations, messages */
import { icone } from "./icones.js";
import { esc } from "./utils.js";

const couche = () => document.getElementById("couche-feuilles");
const pile = [];

/**
 * Ouvre une feuille (fenêtre qui monte du bas de l'écran).
 * @returns {{el: HTMLElement, fermer: Function}}
 */
export function ouvrirFeuille({ titre, contenu, actions = "", surFermeture } = {}) {
  const voile = document.createElement("div");
  voile.className = "voile";
  const f = document.createElement("div");
  f.className = "feuille";
  f.setAttribute("role", "dialog");
  f.setAttribute("aria-modal", "true");
  f.setAttribute("aria-label", titre || "");
  f.innerHTML = `
    <div class="poignee"></div>
    <div class="feuille-entete"><h2>${esc(titre || "")}</h2>
      <button type="button" class="bouton-icone" data-fermer aria-label="Fermer">${icone("x")}</button></div>
    <div class="feuille-corps">${contenu || ""}</div>
    ${actions ? `<div class="feuille-actions">${actions}</div>` : ""}`;
  couche().append(voile, f);
  document.body.style.overflow = "hidden";

  let fermee = false;
  const fermer = () => {
    if (fermee) return; fermee = true;
    voile.remove(); f.remove();
    const i = pile.indexOf(entree); if (i >= 0) pile.splice(i, 1);
    if (!pile.length) document.body.style.overflow = "";
    surFermeture?.();
  };
  const entree = { fermer };
  pile.push(entree);
  voile.addEventListener("click", fermer);
  f.querySelector("[data-fermer]").addEventListener("click", fermer);
  setTimeout(() => f.querySelector("[autofocus]")?.focus(), 250);
  return { el: f, fermer };
}

export function fermerToutesFeuilles() { [...pile].forEach((e) => e.fermer()); }
addEventListener("keydown", (e) => { if (e.key === "Escape" && pile.length) pile[pile.length - 1].fermer(); });
// Bouton « retour » d'Android : ferme d'abord la feuille ouverte
addEventListener("popstate", () => { if (pile.length) pile[pile.length - 1].fermer(); });

/** Demande une confirmation. Retourne une promesse booléenne. */
export function confirmer(message, { ok = "Confirmer", danger = false } = {}) {
  return new Promise((resoudre) => {
    let rep = false;
    const { el, fermer } = ouvrirFeuille({
      titre: "Confirmation",
      contenu: `<p style="margin:0 0 6px;font-size:17px">${esc(message)}</p>`,
      actions: `<button type="button" class="bouton discret" data-non>Annuler</button>
                <button type="button" class="bouton ${danger ? "danger" : ""}" data-oui>${esc(ok)}</button>`,
      surFermeture: () => resoudre(rep)
    });
    el.querySelector("[data-non]").onclick = fermer;
    el.querySelector("[data-oui]").onclick = () => { rep = true; fermer(); };
  });
}

/** Petit message temporaire en bas de l'écran */
export function toast(message, duree = 2800) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), duree);
}

/** Valeurs d'un formulaire sous forme d'objet (texte nettoyé) */
export function valeursFormulaire(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === "string" ? v.trim() : v;
  form.querySelectorAll('input[type="checkbox"][name]').forEach((c) => { o[c.name] = c.checked; });
  return o;
}

/* ---------- Éditeur d'ingrédients (lignes nom + quantité) ---------- */
export function htmlEditeurIngredients(ingredients = []) {
  const lignes = (ingredients.length ? ingredients : [{ nom: "", quantite: "" }]).map(ligneIngredient).join("");
  return `<div class="ingredients-editeur">
    <span class="libelle">Ingrédients</span>
    <div data-lignes>${lignes}</div>
    <button type="button" class="bouton secondaire petit" data-ajouter-ingredient>${icone("plus")} Ajouter un ingrédient</button>
  </div>`;
}
function ligneIngredient(i) {
  return `<div class="ligne-ingredient">
    <input type="text" data-ing-nom placeholder="Ingrédient" value="${esc(i.nom)}" autocomplete="off">
    <input type="text" data-ing-qte placeholder="Quantité" value="${esc(i.quantite)}" autocomplete="off">
    <button type="button" class="bouton-icone" data-retirer-ingredient aria-label="Retirer">${icone("x")}</button>
  </div>`;
}
export function brancherEditeurIngredients(racine) {
  const conteneur = racine.querySelector("[data-lignes]");
  if (!conteneur) return;
  racine.querySelector("[data-ajouter-ingredient]").addEventListener("click", () => {
    conteneur.insertAdjacentHTML("beforeend", ligneIngredient({ nom: "", quantite: "" }));
    conteneur.lastElementChild.querySelector("input").focus();
  });
  conteneur.addEventListener("click", (e) => {
    const b = e.target.closest("[data-retirer-ingredient]");
    if (!b) return;
    if (conteneur.children.length > 1) b.parentElement.remove();
    else b.parentElement.querySelectorAll("input").forEach((i) => (i.value = ""));
  });
  // « Entrée » dans la quantité ajoute une ligne
  conteneur.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-ing-qte]")) {
      e.preventDefault();
      racine.querySelector("[data-ajouter-ingredient]").click();
    }
  });
}
export function lireIngredients(racine) {
  return [...racine.querySelectorAll(".ligne-ingredient")]
    .map((l) => ({ nom: l.querySelector("[data-ing-nom]").value.trim(), quantite: l.querySelector("[data-ing-qte]").value.trim() }))
    .filter((i) => i.nom);
}
