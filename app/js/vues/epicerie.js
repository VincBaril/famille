/* =========================================================
   MODULE ÉPICERIE — liste commune + import des ingrédients
   ========================================================= */
import { etat, db, moi, reglagesGeneraux } from "../etat.js";
import { icone } from "../icones.js";
import { ouvrirFeuille, confirmer, toast, valeursFormulaire } from "../ui.js";
import { esc, normaliser, devinerCategorie, CATEGORIES, majuscule } from "../utils.js";

let mettreEnEvidence = null;

export function categories() {
  const perso = (reglagesGeneraux().categoriesPerso || []).filter(Boolean);
  const base = CATEGORIES.filter((c) => c.nom !== "Autres");
  return [...base, ...perso.map((nom) => ({ nom, emoji: "🏷️" })), CATEGORIES.find((c) => c.nom === "Autres")];
}
const emojiDe = (nom) => categories().find((c) => c.nom === nom)?.emoji || "🏷️";

export const articlesAAcheter = () => etat.epicerie.filter((a) => !a.achete);
/** Article existant portant le même nom (comparaison sans accents ni pluriel) */
export const trouverArticle = (nom) => {
  const n = normaliser(nom);
  return etat.epicerie.find((a) => normaliser(a.nom) === n);
};

function optionsCategories(choisie) {
  return categories().map((c) => `<option value="${esc(c.nom)}" ${c.nom === choisie ? "selected" : ""}>${c.emoji} ${esc(c.nom)}</option>`).join("")
    + `<option value="__nouvelle">➕ Nouvelle catégorie…</option>`;
}
function brancherNouvelleCategorie(select) {
  let precedente = select.value;
  select.addEventListener("change", () => {
    if (select.value !== "__nouvelle") { precedente = select.value; return; }
    const nom = (prompt("Nom de la nouvelle catégorie :") || "").trim();
    if (!nom) { select.value = precedente; return; }
    const perso = reglagesGeneraux().categoriesPerso || [];
    if (!categories().some((c) => c.nom.toLowerCase() === nom.toLowerCase())) {
      db().definir("reglages", "general", { categoriesPerso: [...perso, majuscule(nom)] }, { fusion: true });
    }
    const opt = document.createElement("option");
    opt.value = majuscule(nom); opt.textContent = "🏷️ " + majuscule(nom);
    select.insertBefore(opt, select.lastElementChild);
    select.value = opt.value; precedente = opt.value;
  });
}

/** Ajout rapide d'un produit, avec anti-doublon */
export function ajouterProduit({ nom, quantite = "", categorie, commentaire = "" }) {
  nom = majuscule(nom.trim());
  if (!nom) return null;
  const existant = trouverArticle(nom);
  if (existant && !existant.achete) {
    toast(`« ${existant.nom} » est déjà dans la liste`);
    mettreEnEvidence = existant.id;
    return existant.id;
  }
  if (existant && existant.achete) {
    db().modifier("epicerie", existant.id, { achete: false, quantite: quantite || existant.quantite || "", commentaire: commentaire || existant.commentaire || "", modifieLe: Date.now() });
    toast(`« ${existant.nom} » remis dans la liste`);
    return existant.id;
  }
  return db().ajouter("epicerie", {
    nom, quantite, categorie: categorie || devinerCategorie(nom), commentaire,
    achete: false, ajoutePar: moi() || null, creeLe: Date.now(), modifieLe: Date.now()
  });
}

export function ouvrirFormProduit(id) {
  const a = id ? etat.epicerie.find((x) => x.id === id) : null;
  const v = a || { nom: "", quantite: "", categorie: "", commentaire: "" };
  const { el, fermer } = ouvrirFeuille({
    titre: a ? "Modifier le produit" : "Ajouter un produit",
    contenu: `<form id="form-produit" autocomplete="off">
      <label class="champ"><span>Produit</span><input name="nom" required maxlength="80" value="${esc(v.nom)}" ${a ? "" : "autofocus"} placeholder="Ex. : Lait 2 %"></label>
      <label class="champ"><span>Quantité</span><input name="quantite" maxlength="40" value="${esc(v.quantite)}" placeholder="Ex. : 2 L, 3, 500 g"></label>
      <label class="champ"><span>Catégorie</span><select name="categorie">${optionsCategories(v.categorie || "Autres")}</select></label>
      <label class="champ"><span>Commentaire</span><input name="commentaire" maxlength="200" value="${esc(v.commentaire)}" placeholder="Ex. : la marque en spécial"></label>
      ${a ? `<label class="interrupteur"><span>Acheté</span><input type="checkbox" name="achete" ${a.achete ? "checked" : ""}></label>` : ""}
    </form>`,
    actions: `${a ? `<button type="button" class="bouton danger" data-supprimer style="flex:0 0 auto" aria-label="Supprimer">${icone("poubelle")}</button>` : ""}
      <button type="submit" form="form-produit" class="bouton">${icone("coche")} Enregistrer</button>`
  });
  const form = el.querySelector("form");
  const sel = form.querySelector("[name=categorie]");
  brancherNouvelleCategorie(sel);
  // Catégorie devinée pendant la saisie (nouveau produit)
  if (!a) form.querySelector("[name=nom]").addEventListener("input", (e) => { sel.value = devinerCategorie(e.target.value); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = valeursFormulaire(form);
    if (!d.nom || d.categorie === "__nouvelle") return;
    if (a) {
      db().modifier("epicerie", a.id, { nom: majuscule(d.nom), quantite: d.quantite, categorie: d.categorie, commentaire: d.commentaire, achete: !!d.achete, modifieLe: Date.now() });
      toast("Produit modifié");
    } else {
      ajouterProduit(d);
    }
    fermer();
  });
  el.querySelector("[data-supprimer]")?.addEventListener("click", () => {
    db().supprimer("epicerie", a.id); fermer(); toast(`« ${a.nom} » supprimé`);
  });
}

/* =========================================================
   « Ajouter les ingrédients à l'épicerie »
   1. récupère les ingrédients ; 2. vérifie s'ils existent déjà ;
   3. évite les doublons ; 4. ajoute les nouveaux ;
   5. permet de modifier les quantités avant de confirmer.
   ========================================================= */
export function ouvrirImportIngredients(ingredients, origine = "") {
  // Fusionne les doublons à l'intérieur de la recette elle-même
  const vus = new Map();
  for (const i of ingredients || []) {
    const n = normaliser(i.nom);
    if (!n) continue;
    if (vus.has(n)) {
      const p = vus.get(n);
      if (i.quantite) p.quantite = [p.quantite, i.quantite].filter(Boolean).join(" + ");
    } else vus.set(n, { nom: majuscule(i.nom.trim()), quantite: i.quantite || "" });
  }
  const liste = [...vus.values()].map((i) => {
    const ex = trouverArticle(i.nom);
    const statut = !ex ? "nouveau" : ex.achete ? "achete" : "existe";
    return { ...i, existant: ex, statut, categorie: ex?.categorie || devinerCategorie(i.nom) };
  });
  if (!liste.length) { toast("Aucun ingrédient à ajouter"); return; }

  const etiquette = {
    nouveau: `<span class="etat nouveau">Nouveau</span>`,
    achete: `<span class="etat nouveau">Déjà acheté — sera remis dans la liste</span>`,
    existe: `<span class="etat existe">Déjà dans la liste</span>`
  };
  const { el, fermer } = ouvrirFeuille({
    titre: "Ajouter à l'épicerie",
    contenu: `${origine ? `<p class="muet" style="margin:-6px 0 8px">${esc(origine)}</p>` : ""}
      <p class="petit muet" style="margin:0 0 6px">Vérifiez les quantités. Les produits déjà dans la liste ne sont pas ajoutés en double ; cochez-les seulement pour mettre leur quantité à jour.</p>
      <div>${liste.map((i, k) => `
        <div class="ligne-import" data-k="${k}">
          <input type="checkbox" ${i.statut === "existe" ? "" : "checked"} aria-label="Inclure ${esc(i.nom)}">
          <div><b>${esc(i.nom)}</b><br>${etiquette[i.statut]}${i.statut === "existe" && i.existant.quantite ? ` <span class="petit muet">(actuel : ${esc(i.existant.quantite)})</span>` : ""}</div>
          <input type="text" value="${esc(i.quantite || i.existant?.quantite || "")}" placeholder="Qté" aria-label="Quantité de ${esc(i.nom)}">
        </div>`).join("")}</div>`,
    actions: `<button type="button" class="bouton discret" data-annuler>Annuler</button>
      <button type="button" class="bouton" data-confirmer>${icone("ajoutPanier")} Ajouter</button>`
  });
  const majBouton = () => {
    const n = el.querySelectorAll(".ligne-import input[type=checkbox]:checked").length;
    el.querySelector("[data-confirmer]").innerHTML = `${icone("ajoutPanier")} ${n ? `Ajouter (${n})` : "Rien à ajouter"}`;
  };
  el.addEventListener("change", majBouton); majBouton();
  el.querySelector("[data-annuler]").onclick = fermer;
  el.querySelector("[data-confirmer]").onclick = () => {
    let ajoutes = 0, majs = 0, ignores = 0;
    el.querySelectorAll(".ligne-import").forEach((ligne) => {
      const i = liste[Number(ligne.dataset.k)];
      const inclus = ligne.querySelector("input[type=checkbox]").checked;
      const qte = ligne.querySelector("input[type=text]").value.trim();
      if (!inclus) { ignores++; return; }
      // Vérifie à nouveau au moment de confirmer (l'autre téléphone a pu ajouter entre-temps)
      const ex = trouverArticle(i.nom);
      if (ex) {
        db().modifier("epicerie", ex.id, { quantite: qte || ex.quantite || "", achete: false, modifieLe: Date.now() });
        if (i.statut === "existe") majs++; else ajoutes++;
      } else {
        db().ajouter("epicerie", { nom: i.nom, quantite: qte, categorie: i.categorie, commentaire: "", achete: false, ajoutePar: moi() || null, creeLe: Date.now(), modifieLe: Date.now() });
        ajoutes++;
      }
    });
    fermer();
    const parties = [];
    if (ajoutes) parties.push(`${ajoutes} ajouté${ajoutes > 1 ? "s" : ""}`);
    if (majs) parties.push(`${majs} mis à jour`);
    if (ignores) parties.push(`${ignores} déjà présent${ignores > 1 ? "s" : ""}`);
    toast(parties.length ? parties.join(" · ") : "Aucun changement");
  };
}

/* ---------- Rendu ---------- */
function ligneArticle(a) {
  return `<li class="element ${a.achete ? "fait" : ""}" ${mettreEnEvidence === a.id ? 'style="background:var(--ambre-pale);border-radius:12px"' : ""}>
    <button type="button" class="coche ${a.achete ? "cochee" : ""}" data-acheter="${a.id}" aria-label="${a.achete ? "Remettre dans la liste" : "Marquer acheté"}">${icone("coche")}</button>
    <div class="corps" data-ouvrir-produit="${a.id}">
      <div class="titre">${esc(a.nom)} ${a.quantite ? `<span class="qte">${esc(a.quantite)}</span>` : ""}</div>
      ${a.commentaire ? `<div class="petit muet">${esc(a.commentaire)}</div>` : ""}
    </div>
  </li>`;
}

export const vue = {
  titre: "Épicerie",
  rendu() {
    const restants = articlesAAcheter();
    const achetes = etat.epicerie.filter((a) => a.achete).sort((a, b) => (b.modifieLe || 0) - (a.modifieLe || 0));
    const parCat = categories().map((c) => ({
      ...c,
      articles: restants.filter((a) => (categories().some((x) => x.nom === a.categorie) ? a.categorie : "Autres") === c.nom)
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    })).filter((c) => c.articles.length);
    setTimeout(() => { mettreEnEvidence = null; }, 2500);
    return `<div class="titre-page"><div><h2>Épicerie</h2><p>${restants.length} article${restants.length > 1 ? "s" : ""} à acheter</p></div></div>
      <form class="ajout-rapide" id="ajout-rapide" autocomplete="off">
        <input class="entree" id="champ-ajout-rapide" name="nom" maxlength="80" placeholder="Ajouter un produit…" aria-label="Nom du produit" enterkeyhint="done">
        <button class="bouton" type="submit" aria-label="Ajouter">${icone("plus")}</button>
      </form>
      ${!etat.epicerie.length ? `<div class="vide-grand">${icone("panier")}<p>La liste est vide.<br>Ajoutez un produit ci-dessus.</p></div>` : ""}
      ${!restants.length && etat.epicerie.length ? `<div class="carte"><p class="vide">Tout est acheté ! 🎉</p></div>` : ""}
      ${parCat.map((c) => `<div class="carte" style="padding:12px 14px 4px">
          <p class="categorie-titre"><span class="emoji">${c.emoji}</span>${esc(c.nom)} <span class="compte muet petit">(${c.articles.length})</span></p>
          <ul class="liste">${c.articles.map(ligneArticle).join("")}</ul></div>`).join("")}
      ${achetes.length ? `<h3 class="section">${icone("panier")} Dans le panier <span class="compte">${achetes.length}</span></h3>
        <div class="carte" style="padding:4px 14px"><ul class="liste">${achetes.map(ligneArticle).join("")}</ul></div>
        <button type="button" class="bouton discret large" data-vider>${icone("poubelle")} Retirer les articles achetés</button>` : ""}`;
  },
  fab: () => ouvrirFormProduit(),
  monter(el) {
    el.addEventListener("submit", (e) => {
      if (e.target.id !== "ajout-rapide") return;
      e.preventDefault();
      const champ = e.target.querySelector("input");
      const nom = champ.value.trim();
      if (!nom) return;
      ajouterProduit({ nom });
      champ.value = "";
      champ.focus();
    });
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-acheter]");
      if (b) {
        const a = etat.epicerie.find((x) => x.id === b.dataset.acheter);
        if (a) db().modifier("epicerie", a.id, { achete: !a.achete, modifieLe: Date.now(), achetePar: !a.achete ? moi() || null : null });
        return;
      }
      const o = e.target.closest("[data-ouvrir-produit]");
      if (o) return ouvrirFormProduit(o.dataset.ouvrirProduit);
      if (e.target.closest("[data-vider]")) {
        const achetes = etat.epicerie.filter((a) => a.achete);
        if (await confirmer(`Retirer ${achetes.length} article(s) acheté(s) de la liste ?`, { ok: "Retirer" })) {
          achetes.forEach((a) => db().supprimer("epicerie", a.id));
          toast("Articles retirés");
        }
      }
    });
  }
};

export { emojiDe };
