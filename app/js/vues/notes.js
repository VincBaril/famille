/* =========================================================
   MODULE NOTES — espace partagé
   ========================================================= */
import { etat, db, moi } from "../etat.js";
import { icone } from "../icones.js";
import { ouvrirFeuille, confirmer, toast, valeursFormulaire } from "../ui.js";
import { esc, aujourdhui, dateLongue, normaliser } from "../utils.js";

let recherche = "";

export const notesTriees = () => [...etat.notes].sort((a, b) =>
  (!!b.epinglee - !!a.epinglee) || (b.modifieLe || 0) - (a.modifieLe || 0));

export function ouvrirFormNote(id) {
  const n = id ? etat.notes.find((x) => x.id === id) : null;
  const v = n || { titre: "", texte: "", date: aujourdhui(), epinglee: false };
  const { el, fermer } = ouvrirFeuille({
    titre: n ? "Modifier la note" : "Nouvelle note",
    contenu: `<form id="form-note" autocomplete="off">
      <label class="champ"><span>Titre</span><input name="titre" maxlength="120" value="${esc(v.titre)}" ${n ? "" : "autofocus"} placeholder="Ex. : Code du garage"></label>
      <label class="champ"><span>Texte</span><textarea name="texte" maxlength="10000" style="min-height:200px">${esc(v.texte)}</textarea></label>
      <label class="champ"><span>Date</span><input type="date" name="date" value="${esc(v.date || "")}"></label>
      <label class="interrupteur"><span>${icone("epingle")} Épingler (note importante)</span><input type="checkbox" name="epinglee" ${v.epinglee ? "checked" : ""}></label>
    </form>`,
    actions: `${n ? `<button type="button" class="bouton danger" data-supprimer style="flex:0 0 auto" aria-label="Supprimer">${icone("poubelle")}</button>` : ""}
      <button type="submit" form="form-note" class="bouton">${icone("coche")} Enregistrer</button>`
  });
  const form = el.querySelector("form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = valeursFormulaire(form);
    if (!d.titre && !d.texte) { toast("La note est vide."); return; }
    const donnees = { titre: d.titre || "Sans titre", texte: d.texte || "", date: d.date || "", epinglee: !!d.epinglee, modifieLe: Date.now(), modifiePar: moi() || null };
    if (n) { db().modifier("notes", n.id, donnees); toast("Note modifiée"); }
    else { db().ajouter("notes", { ...donnees, creeLe: Date.now(), creePar: moi() || null }); toast("Note ajoutée"); }
    fermer();
  });
  el.querySelector("[data-supprimer]")?.addEventListener("click", async () => {
    if (await confirmer(`Supprimer la note « ${n.titre} » ?`, { ok: "Supprimer", danger: true })) {
      db().supprimer("notes", n.id); fermer(); toast("Note supprimée");
    }
  });
}

export const vue = {
  titre: "Notes",
  rendu() {
    const q = normaliser(recherche);
    const liste = notesTriees().filter((n) => !q || normaliser(n.titre + " " + n.texte).includes(q));
    return `<div class="titre-page"><div><h2>Notes</h2><p>${etat.notes.length} note${etat.notes.length > 1 ? "s" : ""} partagée${etat.notes.length > 1 ? "s" : ""}</p></div></div>
      ${etat.notes.length > 3 ? `<div class="ajout-rapide"><input class="entree" id="recherche-notes" placeholder="Rechercher…" value="${esc(recherche)}" aria-label="Rechercher dans les notes"></div>` : ""}
      ${!etat.notes.length ? `<div class="vide-grand">${icone("notes")}<p>Aucune note.<br>Touchez <b>+</b> pour écrire la première.</p></div>`
        : `<div class="grille-notes">${liste.map((n) => `
        <div class="carte-note ${n.epinglee ? "epinglee" : ""}" data-ouvrir-note="${n.id}" role="button" tabindex="0">
          ${n.epinglee ? `<span class="epingle" aria-label="Épinglée">${icone("epingle")}</span>` : ""}
          <h4>${esc(n.titre)}</h4><p>${esc(n.texte)}</p>
          <small>${n.date ? esc(dateLongue(n.date)) : ""}</small>
        </div>`).join("")}</div>`}`;
  },
  fab: () => ouvrirFormNote(),
  monter(el, rerendre) {
    el.addEventListener("click", (e) => {
      const o = e.target.closest("[data-ouvrir-note]");
      if (o) ouvrirFormNote(o.dataset.ouvrirNote);
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-ouvrir-note]")) ouvrirFormNote(e.target.dataset.ouvrirNote); });
    el.addEventListener("input", (e) => { if (e.target.id === "recherche-notes") { recherche = e.target.value; rerendre(); } });
  }
};
