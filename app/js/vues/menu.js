/* =========================================================
   MODULE MENU DE LA SEMAINE + BIBLIOTHÈQUE DE RECETTES
   ========================================================= */
import { etat, db, moi } from "../etat.js";
import { icone } from "../icones.js";
import { ouvrirFeuille, confirmer, toast, valeursFormulaire, htmlEditeurIngredients, brancherEditeurIngredients, lireIngredients } from "../ui.js";
import { esc, aujourdhui, ajouterJours, debutSemaine, dateDe, jourCourt, jourMois, dateMoyenne, compresserImage, redimensionnerDataUrl, normaliser } from "../utils.js";
import { ouvrirImportIngredients } from "./epicerie.js";

let onglet = "semaine";

/** Nettoie un lien de recette : ajoute https:// au besoin, refuse tout sauf http/https */
function nettoyerLien(texte) {
  let t = String(texte || "").trim();
  if (!t) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = "https://" + t;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

let semaine = null;
let recherche = "";

export const repasDu = (date) => etat.repas.find((r) => r.id === date);
export const recette = (id) => etat.recettes.find((r) => r.id === id);
export function ingredientsDuRepas(r) {
  if (!r) return [];
  if (r.ingredients?.length) return r.ingredients;
  return recette(r.recetteId)?.ingredients || [];
}

/* ---------- Formulaire d'un souper ---------- */
export function ouvrirFormRepas(date) {
  const r = repasDu(date);
  const v = r || { nom: "", description: "", recetteId: "", ingredients: [], commentaires: "" };
  const recettesTriees = [...etat.recettes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const { el, fermer } = ouvrirFeuille({
    titre: `Souper — ${dateMoyenne(date)}`,
    contenu: `<form id="form-repas" autocomplete="off">
      ${recettesTriees.length ? `<label class="champ"><span>Choisir une recette</span><select name="recetteId">
        <option value="">— Aucune (repas libre) —</option>
        ${recettesTriees.map((x) => `<option value="${x.id}" ${x.id === v.recetteId ? "selected" : ""}>${esc(x.nom)}</option>`).join("")}
      </select></label>` : `<p class="petit muet">Astuce : créez des recettes dans l'onglet « Recettes » pour les choisir ici.</p>`}
      <label class="champ"><span>Repas</span><input name="nom" required maxlength="100" value="${esc(v.nom)}" ${r ? "" : "autofocus"} placeholder="Ex. : Spaghetti sauce à la viande"></label>
      <label class="champ"><span>Description</span><input name="description" maxlength="300" value="${esc(v.description)}" placeholder="Ex. : avec salade César"></label>
      ${htmlEditeurIngredients(v.ingredients?.length ? v.ingredients : recette(v.recetteId)?.ingredients || [])}
      <label class="champ" style="margin-top:14px"><span>Commentaires</span><textarea name="commentaires" maxlength="1000" placeholder="Ex. : sortir le bœuf du congélateur le matin">${esc(v.commentaires)}</textarea></label>
      <button type="button" class="bouton secondaire large" data-vers-epicerie>${icone("ajoutPanier")} Ajouter les ingrédients à l'épicerie</button>
    </form>`,
    actions: `${r ? `<button type="button" class="bouton danger" data-supprimer style="flex:0 0 auto" aria-label="Supprimer">${icone("poubelle")}</button>` : ""}
      <button type="submit" form="form-repas" class="bouton">${icone("coche")} Enregistrer</button>`
  });
  const form = el.querySelector("form");
  brancherEditeurIngredients(form);
  const sel = form.querySelector("[name=recetteId]");
  sel?.addEventListener("change", () => {
    const rec = recette(sel.value);
    if (!rec) return;
    form.querySelector("[name=nom]").value = rec.nom;
    if (!form.querySelector("[name=description]").value) form.querySelector("[name=description]").value = rec.description || "";
    const editeur = form.querySelector(".ingredients-editeur");
    editeur.outerHTML = htmlEditeurIngredients(rec.ingredients || []);
    brancherEditeurIngredients(form);
  });
  const lire = () => {
    const d = valeursFormulaire(form);
    return { nom: d.nom, description: d.description || "", recetteId: d.recetteId || "", ingredients: lireIngredients(form), commentaires: d.commentaires || "", date, modifieLe: Date.now(), modifiePar: moi() || null };
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = lire();
    if (!d.nom) return;
    db().definir("repas", date, d);
    toast("Souper enregistré");
    fermer();
  });
  el.querySelector("[data-vers-epicerie]").addEventListener("click", () => {
    const d = lire();
    if (d.nom) db().definir("repas", date, d); // on enregistre aussi le repas
    ouvrirImportIngredients(d.ingredients, d.nom ? `Pour : ${d.nom}` : "");
  });
  el.querySelector("[data-supprimer]")?.addEventListener("click", async () => {
    if (await confirmer("Retirer ce souper du menu ?", { ok: "Retirer", danger: true })) {
      db().supprimer("repas", date); fermer(); toast("Souper retiré");
    }
  });
}

/* ---------- Formulaire d'une recette ---------- */
export function ouvrirFormRecette(id) {
  const r = id ? recette(id) : null;
  const v = r || { nom: "", description: "", ingredients: [], instructions: "", tempsPrep: "", portions: "", lien: "" };
  let photo = undefined;      // undefined = inchangée, null = retirée, string = nouvelle
  let vignette = undefined;
  const { el, fermer } = ouvrirFeuille({
    titre: r ? "Modifier la recette" : "Nouvelle recette",
    contenu: `<form id="form-recette" autocomplete="off">
      <label class="champ"><span>Nom</span><input name="nom" required maxlength="100" value="${esc(v.nom)}" ${r ? "" : "autofocus"} placeholder="Ex. : Pâté chinois"></label>
      <label class="champ"><span>Description</span><textarea name="description" maxlength="500" style="min-height:70px">${esc(v.description)}</textarea></label>
      <div class="deux-colonnes">
        <label class="champ"><span>Préparation (min)</span><input type="number" inputmode="numeric" min="0" max="1440" name="tempsPrep" value="${esc(v.tempsPrep)}"></label>
        <label class="champ"><span>Portions</span><input type="number" inputmode="numeric" min="1" max="99" name="portions" value="${esc(v.portions)}"></label>
      </div>
      ${htmlEditeurIngredients(v.ingredients || [])}
      <label class="champ" style="margin-top:14px"><span>Lien vers la recette (facultatif)</span><input type="text" name="lien" inputmode="url" autocapitalize="off" spellcheck="false" maxlength="500" value="${esc(v.lien || "")}" placeholder="Ex. : https://www.ricardocuisine.com/…"></label>
      <label class="champ"><span>Instructions de préparation</span><textarea name="instructions" maxlength="8000" style="min-height:160px" placeholder="1. Préchauffer le four…">${esc(v.instructions)}</textarea></label>
      <div class="champ"><span class="libelle">Photo (facultatif)</span>
        <img data-apercu class="photo-recette" alt="" ${r?.vignette ? `src="${r.vignette}"` : "hidden"}>
        <div class="rangee-boutons" style="margin-top:0">
          <label class="bouton secondaire petit">${icone("photo")} Choisir une photo<input type="file" accept="image/*" hidden data-photo></label>
          <button type="button" class="bouton discret petit" data-retirer-photo ${r?.aPhoto ? "" : "hidden"}>Retirer la photo</button>
        </div>
      </div>
    </form>`,
    actions: `${r ? `<button type="button" class="bouton danger" data-supprimer style="flex:0 0 auto" aria-label="Supprimer">${icone("poubelle")}</button>` : ""}
      <button type="submit" form="form-recette" class="bouton">${icone("coche")} Enregistrer</button>`
  });
  const form = el.querySelector("form");
  brancherEditeurIngredients(form);
  const apercu = form.querySelector("[data-apercu]");
  if (r?.aPhoto) db().lire("photos", r.id).then((p) => { if (p?.data && photo === undefined) { apercu.src = p.data; apercu.hidden = false; } });
  form.querySelector("[data-photo]").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      photo = await compresserImage(f, 900, 0.72);
      vignette = await redimensionnerDataUrl(photo, 260, 0.65);
      apercu.src = photo; apercu.hidden = false;
      form.querySelector("[data-retirer-photo]").hidden = false;
    } catch { toast("Cette image n'a pas pu être lue."); }
  });
  form.querySelector("[data-retirer-photo]").addEventListener("click", (e) => {
    photo = null; vignette = null; apercu.hidden = true; apercu.removeAttribute("src"); e.target.hidden = true;
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = valeursFormulaire(form);
    if (!d.nom) return;
    const lien = nettoyerLien(d.lien);
    if (lien === null) { toast("Ce lien n'est pas valide. Il doit commencer par https://"); form.querySelector("[name=lien]").focus(); return; }
    const donnees = {
      nom: d.nom, description: d.description || "", lien, ingredients: lireIngredients(form), instructions: d.instructions || "",
      tempsPrep: d.tempsPrep ? Number(d.tempsPrep) : "", portions: d.portions ? Number(d.portions) : "", modifieLe: Date.now()
    };
    if (photo !== undefined) { donnees.aPhoto = !!photo; donnees.vignette = vignette || null; }
    let rid = r?.id;
    if (r) db().modifier("recettes", r.id, donnees);
    else { rid = db().ajouter("recettes", { ...donnees, aPhoto: !!photo, vignette: vignette || null, creeLe: Date.now(), creePar: moi() || null }); }
    if (photo) db().definir("photos", rid, { data: photo });
    else if (photo === null && r) db().supprimer("photos", r.id);
    toast(r ? "Recette modifiée" : "Recette ajoutée");
    fermer();
    if (!r) location.hash = `#/recette/${rid}`;
  });
  el.querySelector("[data-supprimer]")?.addEventListener("click", async () => {
    if (await confirmer(`Supprimer la recette « ${r.nom} » ?`, { ok: "Supprimer", danger: true })) {
      db().supprimer("recettes", r.id);
      if (r.aPhoto) db().supprimer("photos", r.id);
      fermer(); toast("Recette supprimée"); location.hash = "#/menu";
    }
  });
}

function ouvrirPlanifier(rec) {
  // Propose le premier soir libre de la semaine, sinon aujourd'hui
  let defaut = aujourdhui();
  for (let i = 0; i < 7; i++) { const d = ajouterJours(aujourdhui(), i); if (!repasDu(d)) { defaut = d; break; } }
  const { el, fermer } = ouvrirFeuille({
    titre: "Planifier un souper",
    contenu: `<p style="margin-top:0"><b>${esc(rec.nom)}</b></p>
      <label class="champ"><span>Quel soir ?</span><input type="date" name="date" value="${defaut}" required></label>
      <p class="petit muet" data-avertissement></p>`,
    actions: `<button type="button" class="bouton" data-ok>${icone("agenda")} Planifier</button>`
  });
  const champ = el.querySelector("[name=date]");
  const avert = el.querySelector("[data-avertissement]");
  const maj = () => { const ex = repasDu(champ.value); avert.textContent = ex ? `Remplacera « ${ex.nom} » prévu ce soir-là.` : ""; };
  champ.addEventListener("change", maj); maj();
  el.querySelector("[data-ok]").onclick = () => {
    if (!champ.value) return;
    db().definir("repas", champ.value, { nom: rec.nom, description: rec.description || "", recetteId: rec.id, ingredients: rec.ingredients || [], commentaires: "", date: champ.value, modifieLe: Date.now(), modifiePar: moi() || null });
    fermer(); toast(`Planifié : ${dateMoyenne(champ.value)}`);
  };
}

/* ---------- Rendu ---------- */
function rendreSemaine() {
  const debut = semaine || debutSemaine(aujourdhui());
  const fin = ajouterJours(debut, 6);
  const auj = aujourdhui();
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  const tousIngr = jours.flatMap((d) => ingredientsDuRepas(repasDu(d)));
  return `<div class="navigation-semaine">
      <button type="button" class="bouton-icone" data-semaine="-7" aria-label="Semaine précédente">${icone("gauche")}</button>
      <div class="libelle-semaine">${jourMois(debut)} au ${jourMois(fin)}${debut !== debutSemaine(auj) ? `<br><button type="button" class="bouton discret petit" data-semaine="0" style="min-height:32px;margin-top:4px">Cette semaine</button>` : ""}</div>
      <button type="button" class="bouton-icone" data-semaine="7" aria-label="Semaine suivante">${icone("droite")}</button>
    </div>
    ${jours.map((d) => {
      const r = repasDu(d);
      const rec = r?.recetteId ? recette(r.recetteId) : null;
      return `<div class="carte jour-menu ${d === auj ? "aujourdhui" : ""}" data-repas="${d}" role="button" tabindex="0">
        <div class="etiquette-jour"><small>${jourCourt(d)}</small><b>${dateDe(d).getDate()}</b></div>
        <div class="details">${r ? `<div class="nom">${esc(r.nom)}</div>
            ${r.description ? `<div class="petit muet">${esc(r.description)}</div>` : ""}
            <div class="meta petit muet" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              ${rec ? `<span class="puce vert">${icone("livre")} Recette</span>` : ""}
              ${ingredientsDuRepas(r).length ? `<span class="puce">${ingredientsDuRepas(r).length} ingrédients</span>` : ""}
              ${r.commentaires ? `<span class="puce">💬 Note</span>` : ""}
            </div>` : `<div class="vide-repas">${icone("plus")} Ajouter un souper</div>`}</div>
      </div>`;
    }).join("")}
    ${tousIngr.length ? `<button type="button" class="bouton secondaire large" data-semaine-epicerie>${icone("ajoutPanier")} Ajouter les ingrédients de la semaine à l'épicerie</button>` : ""}`;
}

function rendreRecettes() {
  const q = normaliser(recherche);
  const liste = [...etat.recettes].filter((r) => !q || normaliser(r.nom + " " + (r.description || "") + " " + (r.ingredients || []).map((i) => i.nom).join(" ")).includes(q))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return `<div class="ajout-rapide"><input class="entree" id="recherche-recettes" placeholder="Rechercher une recette ou un ingrédient…" value="${esc(recherche)}" aria-label="Rechercher"></div>
    ${!etat.recettes.length ? `<div class="vide-grand">${icone("livre")}<p>Votre bibliothèque de recettes est vide.<br>Touchez <b>+</b> pour ajouter votre première recette.</p></div>`
      : !liste.length ? `<p class="vide">Aucune recette ne correspond.</p>`
      : `<div class="grille-recettes">${liste.map((r) => `
        <a class="carte-recette" href="#/recette/${r.id}">
          <div class="visuel" ${r.vignette ? `style="background-image:url('${r.vignette}')"` : ""}>${r.vignette ? "" : icone("menu")}</div>
          <div class="texte"><b>${esc(r.nom)}</b><small>${[r.tempsPrep ? `${r.tempsPrep} min` : "", r.portions ? `${r.portions} portions` : ""].filter(Boolean).join(" · ") || `${(r.ingredients || []).length} ingrédients`}</small></div>
        </a>`).join("")}</div>`}`;
}

export const vue = {
  titre: "Menu",
  rendu(params) {
    if (params?.[0] === "recettes") onglet = "recettes";
    return `<div class="titre-page"><div><h2>${onglet === "semaine" ? "Menu de la semaine" : "Recettes"}</h2><p>${onglet === "semaine" ? "Les soupers du dimanche au samedi" : `${etat.recettes.length} recette${etat.recettes.length > 1 ? "s" : ""} personnelle${etat.recettes.length > 1 ? "s" : ""}`}</p></div></div>
      <div class="segments">
        <button type="button" data-onglet="semaine" class="${onglet === "semaine" ? "actif" : ""}">${icone("agenda")} Semaine</button>
        <button type="button" data-onglet="recettes" class="${onglet === "recettes" ? "actif" : ""}">${icone("livre")} Recettes</button>
      </div>
      ${onglet === "semaine" ? rendreSemaine() : rendreRecettes()}`;
  },
  fab: () => (onglet === "semaine" ? ouvrirFormRepas(
    Array.from({ length: 7 }, (_, i) => ajouterJours(semaine || debutSemaine(aujourdhui()), i)).find((d) => !repasDu(d) && d >= aujourdhui()) || aujourdhui()
  ) : ouvrirFormRecette()),
  monter(el, rerendre) {
    el.addEventListener("click", (e) => {
      const g = e.target.closest("[data-onglet]");
      if (g) { onglet = g.dataset.onglet; history.replaceState(null, "", onglet === "recettes" ? "#/menu/recettes" : "#/menu"); return rerendre(); }
      const s = e.target.closest("[data-semaine]");
      if (s) {
        const n = Number(s.dataset.semaine);
        semaine = n === 0 ? debutSemaine(aujourdhui()) : ajouterJours(semaine || debutSemaine(aujourdhui()), n);
        return rerendre();
      }
      const j = e.target.closest("[data-repas]");
      if (j) return ouvrirFormRepas(j.dataset.repas);
      if (e.target.closest("[data-semaine-epicerie]")) {
        const debut = semaine || debutSemaine(aujourdhui());
        const ingr = Array.from({ length: 7 }, (_, i) => ingredientsDuRepas(repasDu(ajouterJours(debut, i)))).flat();
        ouvrirImportIngredients(ingr, `Semaine du ${jourMois(debut)}`);
      }
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-repas]")) ouvrirFormRepas(e.target.dataset.repas); });
    el.addEventListener("input", (e) => { if (e.target.id === "recherche-recettes") { recherche = e.target.value; rerendre(); } });
  }
};

/* ---------- Vue détaillée d'une recette ---------- */
export const vueRecette = {
  titre: "Recette",
  rendu([id]) {
    const r = recette(id);
    if (!r) return `<a class="retour" href="#/menu/recettes">${icone("gauche")} Recettes</a>
      <div class="vide-grand">${etat.pret.has("recettes") ? "Cette recette n'existe plus." : "Chargement…"}</div>`;
    return `<a class="retour" href="#/menu/recettes">${icone("gauche")} Recettes</a>
      ${r.aPhoto || r.vignette ? `<img class="photo-recette" data-photo-recette="${r.id}" src="${r.vignette || ""}" alt="Photo : ${esc(r.nom)}">` : ""}
      <div class="titre-page" style="margin-bottom:6px"><div><h2>${esc(r.nom)}</h2></div></div>
      <div class="infos-recette">
        ${r.tempsPrep ? `<span class="puce vert">${icone("minuteur")} ${r.tempsPrep} min</span>` : ""}
        ${r.portions ? `<span class="puce vert">${icone("portions")} ${r.portions} portions</span>` : ""}
      </div>
      ${r.description ? `<p style="margin-top:0">${esc(r.description)}</p>` : ""}
      ${r.lien ? `<a class="bouton secondaire large" href="${esc(r.lien)}" target="_blank" rel="noopener noreferrer" style="margin-bottom:10px">${icone("livre")} Voir la recette en ligne</a>` : ""}
      <div class="rangee-boutons" style="margin-bottom:14px">
        <button type="button" class="bouton" data-recette-epicerie>${icone("ajoutPanier")} Ajouter les ingrédients à l'épicerie</button>
        <button type="button" class="bouton secondaire" data-planifier>${icone("agenda")} Planifier un souper</button>
      </div>
      <div class="carte"><div class="carte-entete"><div class="icone-ronde">${icone("panier")}</div><h3>Ingrédients</h3></div>
        ${(r.ingredients || []).length ? `<ul class="liste">${r.ingredients.map((i) => `<li class="element" style="padding:9px 4px"><div class="corps" style="cursor:default">${esc(i.nom)}</div>${i.quantite ? `<span class="qte">${esc(i.quantite)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="vide">Aucun ingrédient.</p>`}
      </div>
      <div class="carte"><div class="carte-entete"><div class="icone-ronde">${icone("livre")}</div><h3>Préparation</h3></div>
        ${r.instructions ? `<div class="instructions">${esc(r.instructions)}</div>` : `<p class="vide">Aucune instruction.</p>`}
      </div>
      <button type="button" class="bouton discret large" data-modifier-recette>${icone("crayon")} Modifier la recette</button>`;
  },
  apresRendu(el, [id]) {
    const img = el.querySelector("[data-photo-recette]");
    const r = recette(id);
    if (img && r?.aPhoto) {
      if (vueRecette._cache?.id === id) img.src = vueRecette._cache.data;
      else db().lire("photos", id).then((p) => { if (p?.data) { vueRecette._cache = { id, data: p.data }; img.src = p.data; } });
    }
  },
  monter(el, rerendre, params) {
    el.addEventListener("click", (e) => {
      const r = recette(params()[0]);
      if (!r) return;
      if (e.target.closest("[data-recette-epicerie]")) ouvrirImportIngredients(r.ingredients, `Recette : ${r.nom}`);
      if (e.target.closest("[data-planifier]")) ouvrirPlanifier(r);
      if (e.target.closest("[data-modifier-recette]")) { vueRecette._cache = null; ouvrirFormRecette(r.id); }
    });
  }
};
