/* =========================================================
   MODULE TÂCHES — gestionnaire partagé + historique permanent
   ========================================================= */
import { etat, db, moi, nomResponsable } from "../etat.js";
import { icone } from "../icones.js";
import { ouvrirFeuille, confirmer, toast, valeursFormulaire } from "../ui.js";
import { esc, aujourdhui, relatif, heure, horodatage, dateHeureDe, dateDeMs, moisAnnee, iso } from "../utils.js";
import { pucePersonne, choixPersonne, RAPPELS_TACHE, selectRappel, libelleRappel, pucesPersonnes } from "./commun.js";

let onglet = "afaire";
let filtre = "tous";

const PRIORITES = [
  { v: "basse", l: "Basse" },
  { v: "normale", l: "Normale" },
  { v: "haute", l: "Haute" }
];
const rang = { haute: 0, normale: 1, basse: 2 };
export const trierTaches = (a, b) =>
  (a.statut === "terminee") - (b.statut === "terminee") ||
  (rang[a.priorite] ?? 1) - (rang[b.priorite] ?? 1) ||
  (a.heure || "99").localeCompare(b.heure || "99") ||
  (a.titre || "").localeCompare(b.titre || "", "fr");

const pourPersonne = (t, f) => f === "tous" || t.responsable === f || t.responsable === "tous";

/* ---------- Actions ---------- */
export function basculerTache(id) {
  const t = etat.taches.find((x) => x.id === id);
  if (!t) return;
  if (t.statut === "terminee") {
    db().modifier("taches", id, { statut: "a_faire", termineeLe: null, termineePar: null });
    return;
  }
  const maintenant = Date.now();
  db().modifier("taches", id, { statut: "terminee", termineeLe: maintenant, termineePar: moi() || null });
  // Historique permanent (jamais supprimé automatiquement)
  db().ajouter("historique", {
    tacheId: id,
    titre: t.titre,
    responsable: t.responsable || "tous",
    responsableNom: nomResponsable(t.responsable),
    creeLe: t.creeLe || maintenant,
    realiseeLe: maintenant,
    realiseePar: moi() || null,
    realiseeParNom: moi() ? nomResponsable(moi()) : null
  });
  toast("Tâche terminée ✓");
}

export function ouvrirFormTache(id, defauts = {}) {
  const t = id ? etat.taches.find((x) => x.id === id) : null;
  const v = t || { titre: "", description: "", responsable: moi() || "tous", echeance: aujourdhui(), heure: "", priorite: "normale", rappel: "", ...defauts };
  const { el, fermer } = ouvrirFeuille({
    titre: t ? "Modifier la tâche" : "Nouvelle tâche",
    contenu: `<form id="form-tache" autocomplete="off">
      <label class="champ"><span>Titre</span><input name="titre" required maxlength="120" value="${esc(v.titre)}" ${t ? "" : "autofocus"} placeholder="Ex. : Sortir les poubelles"></label>
      <label class="champ"><span>Description</span><textarea name="description" maxlength="2000" placeholder="Détails (facultatif)">${esc(v.description)}</textarea></label>
      <div class="champ"><span class="libelle">Personne responsable</span>${choixPersonne("responsable", v.responsable)}</div>
      <div class="deux-colonnes">
        <label class="champ"><span>Date d'échéance</span><input type="date" name="echeance" value="${esc(v.echeance || "")}"></label>
        <label class="champ"><span>Heure (facultatif)</span><input type="time" name="heure" value="${esc(v.heure || "")}"></label>
      </div>
      <div class="champ"><span class="libelle">Priorité</span><div class="choix">${PRIORITES.map((p) => `
        <label><input type="radio" name="priorite" value="${p.v}" ${p.v === (v.priorite || "normale") ? "checked" : ""}><span>${p.l}</span></label>`).join("")}</div></div>
      <label class="champ"><span>Rappel</span>${selectRappel("rappel", RAPPELS_TACHE, v.rappel)}</label>
      <p class="petit muet" style="margin-top:-6px">Sans heure, le rappel se base sur 9 h le jour de l'échéance.</p>
      ${t ? `<label class="interrupteur"><span>Tâche terminée</span><input type="checkbox" name="terminee" ${t.statut === "terminee" ? "checked" : ""}></label>` : ""}
    </form>`,
    actions: `${t ? `<button type="button" class="bouton danger" data-supprimer style="flex:0 0 auto" aria-label="Supprimer">${icone("poubelle")}</button>` : ""}
      <button type="submit" form="form-tache" class="bouton">${icone("coche")} Enregistrer</button>`
  });
  const form = el.querySelector("form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = valeursFormulaire(form);
    if (!d.titre) return;
    const rappel = d.rappel === "" ? null : Number(d.rappel);
    const rappelA = rappel !== null && d.echeance ? horodatage(d.echeance, d.heure || "09:00") - rappel * 60000 : null;
    const donnees = {
      titre: d.titre, description: d.description || "", responsable: d.responsable || "tous",
      echeance: d.echeance || "", heure: d.heure || "", priorite: d.priorite || "normale",
      rappel, rappelA, modifieLe: Date.now()
    };
    if (!t || t.rappelA !== rappelA) donnees.rappelEnvoye = !rappelA;
    if (t) {
      db().modifier("taches", t.id, donnees);
      const etaitTerminee = t.statut === "terminee";
      if (d.terminee !== etaitTerminee) basculerTache(t.id);
      toast("Tâche modifiée");
    } else {
      db().ajouter("taches", { ...donnees, statut: "a_faire", creeLe: Date.now(), creePar: moi() || null, termineeLe: null });
      toast("Tâche ajoutée");
    }
    fermer();
  });
  el.querySelector("[data-supprimer]")?.addEventListener("click", async () => {
    if (await confirmer(`Supprimer la tâche « ${t.titre} » ? L'historique est conservé.`, { ok: "Supprimer", danger: true })) {
      db().supprimer("taches", t.id); fermer(); toast("Tâche supprimée");
    }
  });
}

/* ---------- Rendu ---------- */
export function ligneTache(t, { montrerDate = true } = {}) {
  const auj = aujourdhui();
  const retard = t.statut !== "terminee" && t.echeance && t.echeance < auj;
  const meta = [pucePersonne(t.responsable)];
  if (retard) meta.push(`<span class="puce retard">En retard · ${esc(relatif(t.echeance))}</span>`);
  else if (montrerDate && t.echeance) meta.push(`<span class="puce">${esc(relatif(t.echeance))}</span>`);
  if (t.heure) meta.push(`<span class="puce">${icone("horloge")} ${heure(t.heure)}</span>`);
  if (t.priorite === "haute") meta.push(`<span class="puce haute">Priorité haute</span>`);
  if (t.rappel !== null && t.rappel !== undefined && t.rappel !== "") meta.push(`<span class="puce" title="${esc(libelleRappel(RAPPELS_TACHE, t.rappel))}">${icone("cloche")}</span>`);
  return `<li class="element ${t.statut === "terminee" ? "fait" : ""} ${t.priorite === "haute" && t.statut !== "terminee" ? "priorite-haute" : ""} ${retard ? "en-retard" : ""}">
    <button type="button" class="coche ${t.statut === "terminee" ? "cochee" : ""}" data-basculer-tache="${t.id}" aria-label="${t.statut === "terminee" ? "Marquer à faire" : "Marquer terminée"}">${icone("coche")}</button>
    <div class="corps" data-ouvrir-tache="${t.id}">
      <div class="titre">${esc(t.titre)}</div>
      ${t.description ? `<div class="petit muet">${esc(t.description).slice(0, 140)}</div>` : ""}
      <div class="meta">${meta.join("")}</div>
    </div>
  </li>`;
}

function section(titre, liste, opts) {
  if (!liste.length) return "";
  return `<h3 class="section">${titre} <span class="compte">${liste.length}</span></h3>
    <div class="carte" style="padding:4px 14px"><ul class="liste">${liste.map((t) => ligneTache(t, opts)).join("")}</ul></div>`;
}

function rendreAFaire() {
  const auj = aujourdhui();
  const ts = etat.taches.filter((t) => pourPersonne(t, filtre));
  const retard = ts.filter((t) => t.statut !== "terminee" && t.echeance && t.echeance < auj).sort((a, b) => a.echeance.localeCompare(b.echeance));
  const ajd = ts.filter((t) => t.echeance === auj).sort(trierTaches);
  const avenir = ts.filter((t) => t.statut !== "terminee" && t.echeance > auj)
    .sort((a, b) => a.echeance.localeCompare(b.echeance) || trierTaches(a, b));
  const sansDate = ts.filter((t) => t.statut !== "terminee" && !t.echeance).sort(trierTaches);
  const terminees = ts.filter((t) => t.statut === "terminee" && t.echeance !== auj).sort((a, b) => (b.termineeLe || 0) - (a.termineeLe || 0));

  if (!ts.length) {
    return `<div class="vide-grand">${icone("taches")}<p>Aucune tâche pour l'instant.<br>Touchez <b>+</b> pour en ajouter une.</p></div>`;
  }
  const faitesAjd = ajd.filter((t) => t.statut === "terminee").length;
  return `
    ${section("En retard", retard)}
    ${section(`Aujourd'hui${ajd.length ? ` — ${faitesAjd}/${ajd.length} terminées` : ""}`, ajd, { montrerDate: false })}
    ${!ajd.length ? `<h3 class="section">Aujourd'hui</h3><div class="carte"><p class="vide">Rien de prévu aujourd'hui.</p></div>` : ""}
    ${section("À venir", avenir)}
    ${section("Sans date", sansDate)}
    ${terminees.length ? `${section("Terminées", terminees.slice(0, 15))}
      <button type="button" class="bouton discret large" data-nettoyer>${icone("poubelle")} Retirer les tâches terminées de la liste</button>
      <p class="petit muet" style="text-align:center">Elles restent dans l'historique.</p>` : ""}`;
}

function rendreHistorique() {
  const h = etat.historique.filter((x) => filtre === "tous" || x.responsable === filtre || x.responsable === "tous");
  if (!h.length) return `<div class="vide-grand">${icone("historique")}<p>L'historique est vide.<br>Les tâches terminées apparaîtront ici, de façon permanente.</p></div>`;
  const groupes = new Map();
  for (const x of h) {
    const cle = moisAnnee(iso(new Date(x.realiseeLe || 0)));
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(x);
  }
  return `<p class="petit muet" style="margin:0 4px">${h.length} tâche${h.length > 1 ? "s" : ""} réalisée${h.length > 1 ? "s" : ""}. L'historique n'est jamais effacé automatiquement.</p>
    ${[...groupes].map(([mois, liste]) => `<h3 class="section">${esc(mois)} <span class="compte">${liste.length}</span></h3>
    <div class="carte" style="padding:4px 14px">${liste.map((x) => `
      <div class="historique-ligne">
        <div class="titre">${icone("coche")} ${esc(x.titre)}</div>
        <div class="meta">Responsable : <b>${esc(x.responsableNom || nomResponsable(x.responsable))}</b>${x.realiseeParNom ? ` · cochée par ${esc(x.realiseeParNom)}` : ""}</div>
        <div class="meta">Créée le ${esc(dateDeMs(x.creeLe))} · Réalisée le ${esc(dateHeureDe(x.realiseeLe))}</div>
      </div>`).join("")}</div>`).join("")}`;
}

export const vue = {
  titre: "Tâches",
  rendu() {
    const nbAFaire = etat.taches.filter((t) => t.statut !== "terminee").length;
    return `<div class="titre-page"><div><h2>Tâches</h2><p>${nbAFaire} à faire</p></div></div>
      <div class="segments">
        <button type="button" data-onglet="afaire" class="${onglet === "afaire" ? "actif" : ""}">À faire</button>
        <button type="button" data-onglet="historique" class="${onglet === "historique" ? "actif" : ""}">${icone("historique")} Historique</button>
      </div>
      ${pucesPersonnes(filtre)}
      ${onglet === "afaire" ? rendreAFaire() : rendreHistorique()}`;
  },
  fab: () => ouvrirFormTache(),
  monter(el, rerendre) {
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-basculer-tache]");
      if (b) return basculerTache(b.dataset.basculerTache);
      const o = e.target.closest("[data-ouvrir-tache]");
      if (o) return ouvrirFormTache(o.dataset.ouvrirTache);
      const g = e.target.closest("[data-onglet]");
      if (g) { onglet = g.dataset.onglet; return rerendre(); }
      const f = e.target.closest("[data-filtre-personne]");
      if (f) { filtre = f.dataset.filtrePersonne; return rerendre(); }
      if (e.target.closest("[data-nettoyer]")) {
        const finies = etat.taches.filter((t) => t.statut === "terminee" && t.echeance !== aujourdhui() && pourPersonne(t, filtre));
        if (await confirmer(`Retirer ${finies.length} tâche(s) terminée(s) de la liste ? Elles resteront dans l'historique.`, { ok: "Retirer" })) {
          finies.forEach((t) => db().supprimer("taches", t.id));
          toast("Liste nettoyée");
        }
      }
    });
  }
};
