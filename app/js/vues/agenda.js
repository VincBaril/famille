/* =========================================================
   MODULE RENDEZ-VOUS — calendrier commun (jour / semaine / mois)
   ========================================================= */
import { etat, db, moi, nomResponsable } from "../etat.js";
import { icone } from "../icones.js";
import { ouvrirFeuille, confirmer, toast, valeursFormulaire } from "../ui.js";
import { esc, majuscule, normaliser, aujourdhui, ajouterJours, ajouterMois, debutSemaine, dateDe, iso, heure, horodatage, dateMoyenne, jourMois, moisAnnee, jourCourt, lienCarte } from "../utils.js";
import { pucePersonne, choixPersonne, RAPPELS_RDV, selectRappel, libelleRappel } from "./commun.js";

let mode = "semaine";
let dateSel = null;

const trier = (a, b) => (a.date + (a.heureDebut || "")).localeCompare(b.date + (b.heureDebut || ""));
const cleRdv = (r) => `${normaliser(r.titre)}|${r.date}|${r.heureDebut || "journee"}`;
/** Rendez-vous affichés : un rendez-vous Outlook identique (même titre, date et heure)
    à un rendez-vous entré dans FAMILLE est caché pour éviter les doublons. */
export function rdvVisibles() {
  const manuels = new Set(etat.rendezvous.filter((r) => r.source !== "outlook").map(cleRdv));
  return etat.rendezvous.filter((r) => r.source !== "outlook" || !manuels.has(cleRdv(r)));
}
export const rdvDu = (d) => rdvVisibles().filter((r) => r.date === d).sort(trier);
export const heureRdv = (r) => (r.journee || !r.heureDebut ? "Journée" : heure(r.heureDebut));
const PUCE_OUTLOOK = `<span class="puce" style="background:#E3ECF5;color:#2F5D86">Outlook</span>`;
/** Rendez-vous à venir (pas encore commencés, ou en cours aujourd'hui) */
export function prochainsRdv(n = 3) {
  const maintenant = Date.now();
  return rdvVisibles()
    .filter((r) => (r.finA || r.debutA || 0) >= maintenant - 15 * 60000 || (r.date === aujourdhui() && !r.heureDebut))
    .sort(trier).slice(0, n);
}

/** Rendez-vous venant d'Outlook : affichage seulement */
function ouvrirDetailOutlook(r) {
  const qui = r.personne === "tous" ? "de vos deux calendriers Outlook" : `du calendrier Outlook de ${esc(nomResponsable(r.personne))}`;
  const { el, fermer } = ouvrirFeuille({
    titre: "Rendez-vous Outlook",
    contenu: `<div class="carte">
        <p style="margin:0;font-size:20px;font-weight:800">${esc(r.titre)}</p>
        <p style="margin:6px 0 0">${esc(majuscule(dateMoyenne(r.date)))}${r.journee || !r.heureDebut ? " · toute la journée" : ` · ${heure(r.heureDebut)}${r.heureFin ? ` à ${heure(r.heureFin)}` : ""}`}</p>
        <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${pucePersonne(r.personne)} ${PUCE_OUTLOOK}
          ${r.rappel !== null && r.rappel !== undefined ? `<span class="puce">${icone("cloche")} ${esc(libelleRappel(RAPPELS_RDV, r.rappel) || r.rappel + " min avant")}</span>` : ""}</div>
        ${r.adresse ? `<a class="adresse" style="display:inline-flex;gap:4px;margin-top:10px" href="${lienCarte(r.adresse)}" target="_blank" rel="noopener">${icone("lieu")} ${esc(r.adresse)}</a>` : ""}
      </div>
      <p class="petit muet">Ce rendez-vous vient ${qui}. Pour le modifier ou le supprimer, utilisez Outlook : FAMILLE se mettra à jour automatiquement (délai possible de 30 minutes ou plus).</p>`,
    actions: `<button type="button" class="bouton" data-ok>OK</button>`
  });
  el.querySelector("[data-ok]").onclick = fermer;
}

export function ouvrirFormRdv(id, dateDefaut) {
  const r = id ? etat.rendezvous.find((x) => x.id === id) : null;
  if (r?.source === "outlook") return ouvrirDetailOutlook(r);
  const v = r || { titre: "", description: "", date: dateDefaut || aujourdhui(), heureDebut: "", heureFin: "", adresse: "", personne: moi() || "tous", notes: "", rappel: 60, important: false };
  const { el, fermer } = ouvrirFeuille({
    titre: r ? "Modifier le rendez-vous" : "Nouveau rendez-vous",
    contenu: `<form id="form-rdv" autocomplete="off">
      <label class="champ"><span>Titre</span><input name="titre" required maxlength="120" value="${esc(v.titre)}" ${r ? "" : "autofocus"} placeholder="Ex. : Dentiste"></label>
      <label class="champ"><span>Date</span><input type="date" name="date" required value="${esc(v.date)}"></label>
      <div class="deux-colonnes">
        <label class="champ"><span>Heure de début</span><input type="time" name="heureDebut" required value="${esc(v.heureDebut)}"></label>
        <label class="champ"><span>Heure de fin (facultatif)</span><input type="time" name="heureFin" value="${esc(v.heureFin)}"></label>
      </div>
      <div class="champ"><span class="libelle">Personne concernée</span>${choixPersonne("personne", v.personne)}</div>
      <label class="champ"><span>Adresse</span><input name="adresse" maxlength="200" value="${esc(v.adresse)}" placeholder="Ex. : 1234, rue Principale"></label>
      <label class="champ"><span>Description</span><input name="description" maxlength="300" value="${esc(v.description)}"></label>
      <label class="champ"><span>Notes</span><textarea name="notes" maxlength="2000" style="min-height:80px" placeholder="Ex. : apporter la carte d'assurance maladie">${esc(v.notes)}</textarea></label>
      <label class="champ"><span>Rappel</span>${selectRappel("rappel", RAPPELS_RDV, v.rappel)}</label>
      <label class="interrupteur"><span>${icone("etoile")} Rappel important (affiché sur l'accueil)</span><input type="checkbox" name="important" ${v.important ? "checked" : ""}></label>
    </form>`,
    actions: `${r ? `<button type="button" class="bouton danger" data-supprimer style="flex:0 0 auto" aria-label="Supprimer">${icone("poubelle")}</button>` : ""}
      <button type="submit" form="form-rdv" class="bouton">${icone("coche")} Enregistrer</button>`
  });
  const form = el.querySelector("form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = valeursFormulaire(form);
    if (!d.titre || !d.date || !d.heureDebut) return;
    if (d.heureFin && d.heureFin < d.heureDebut) { toast("L'heure de fin doit être après le début."); return; }
    const rappel = d.rappel === "" ? null : Number(d.rappel);
    const debutA = horodatage(d.date, d.heureDebut);
    const rappelA = rappel !== null ? debutA - rappel * 60000 : null;
    const donnees = {
      titre: d.titre, description: d.description || "", date: d.date, heureDebut: d.heureDebut, heureFin: d.heureFin || "",
      adresse: d.adresse || "", personne: d.personne || "tous", notes: d.notes || "", rappel, important: !!d.important,
      debutA, finA: d.heureFin ? horodatage(d.date, d.heureFin) : debutA + 3600000, rappelA, modifieLe: Date.now()
    };
    if (!r || r.rappelA !== rappelA) donnees.rappelEnvoye = !rappelA || rappelA < Date.now() - 5 * 60000;
    if (r) { db().modifier("rendezvous", r.id, donnees); toast("Rendez-vous modifié"); }
    else { db().ajouter("rendezvous", { ...donnees, creeLe: Date.now(), creePar: moi() || null }); toast("Rendez-vous ajouté"); }
    dateSel = d.date;
    fermer();
  });
  el.querySelector("[data-supprimer]")?.addEventListener("click", async () => {
    if (await confirmer(`Supprimer « ${r.titre} » ?`, { ok: "Supprimer", danger: true })) {
      db().supprimer("rendezvous", r.id); fermer(); toast("Rendez-vous supprimé");
    }
  });
}

export function ligneRdv(r) {
  return `<div class="rdv" data-ouvrir-rdv="${r.id}" role="button" tabindex="0">
    <div class="heure">${r.journee || !r.heureDebut ? `<span style="font-size:14px">Journée</span>` : heure(r.heureDebut)}${r.heureFin && !r.journee ? `<small>à ${heure(r.heureFin)}</small>` : ""}</div>
    <div class="corps">
      <div class="titre">${r.important ? `<span style="color:var(--ambre)">${icone("etoile")}</span> ` : ""}${esc(r.titre)}</div>
      <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${pucePersonne(r.personne)}${r.source === "outlook" ? PUCE_OUTLOOK : ""}
        ${r.rappel !== null && r.rappel !== undefined ? `<span class="puce">${icone("cloche")} ${esc(libelleRappel(RAPPELS_RDV, r.rappel))}</span>` : ""}</div>
      ${r.description ? `<div class="desc">${esc(r.description)}</div>` : ""}
      ${r.adresse ? `<a class="adresse" href="${lienCarte(r.adresse)}" target="_blank" rel="noopener" data-lien>${icone("lieu")} ${esc(r.adresse)}</a>` : ""}
      ${r.notes ? `<div class="desc">📝 ${esc(r.notes)}</div>` : ""}
    </div>
  </div>`;
}

function blocJour(d, { titre = true } = {}) {
  const liste = rdvDu(d);
  const auj = aujourdhui();
  return `<div class="carte jour-agenda ${d === auj ? "aujourdhui" : ""}" style="padding:12px 14px">
    ${titre ? `<h4><span>${d === auj ? "Aujourd'hui — " + dateMoyenne(d) : majuscule(dateMoyenne(d))}</span><button type="button" class="bouton-icone" data-nouveau-rdv="${d}" aria-label="Ajouter un rendez-vous ce jour" style="width:34px;height:34px">${icone("plus")}</button></h4>` : ""}
    ${liste.length ? liste.map(ligneRdv).join("") : `<p class="vide">Aucun rendez-vous.</p>`}
  </div>`;
}

function rendreJour(d) {
  return `<div class="navigation-semaine">
      <button type="button" class="bouton-icone" data-decaler="-1" aria-label="Jour précédent">${icone("gauche")}</button>
      <div class="libelle-semaine">${majuscule(dateMoyenne(d))}</div>
      <button type="button" class="bouton-icone" data-decaler="1" aria-label="Jour suivant">${icone("droite")}</button>
    </div>${blocJour(d, { titre: false })}`;
}

function rendreSemaine(d) {
  const debut = debutSemaine(d);
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  return `<div class="navigation-semaine">
      <button type="button" class="bouton-icone" data-decaler="-7" aria-label="Semaine précédente">${icone("gauche")}</button>
      <div class="libelle-semaine">${jourMois(debut)} au ${jourMois(jours[6])}</div>
      <button type="button" class="bouton-icone" data-decaler="7" aria-label="Semaine suivante">${icone("droite")}</button>
    </div>${jours.map((j) => blocJour(j)).join("")}`;
}

function rendreMois(d) {
  const premier = dateDe(d); premier.setDate(1);
  const debutGrille = debutSemaine(iso(premier));
  const mois = premier.getMonth();
  const auj = aujourdhui();
  const cases = Array.from({ length: 42 }, (_, i) => ajouterJours(debutGrille, i));
  const semaines = cases[35] && dateDe(cases[35]).getMonth() !== mois ? 5 : 6;
  return `<div class="navigation-semaine">
      <button type="button" class="bouton-icone" data-decaler-mois="-1" aria-label="Mois précédent">${icone("gauche")}</button>
      <div class="libelle-semaine" style="text-transform:capitalize">${moisAnnee(d)}</div>
      <button type="button" class="bouton-icone" data-decaler-mois="1" aria-label="Mois suivant">${icone("droite")}</button>
    </div>
    <div class="carte" style="padding:10px">
      <div class="grille-mois">
        ${cases.slice(0, 7).map((c) => `<div class="entete-jour">${jourCourt(c)}</div>`).join("")}
        ${cases.slice(0, semaines * 7).map((c) => {
          const n = rdvDu(c).length;
          return `<button type="button" data-choisir="${c}" class="${dateDe(c).getMonth() !== mois ? "autre-mois" : ""} ${c === auj ? "aujourdhui" : ""} ${c === d ? "selection" : ""}" aria-label="${dateMoyenne(c)}${n ? `, ${n} rendez-vous` : ""}">
            ${dateDe(c).getDate()}<span class="points">${"<i></i>".repeat(Math.min(n, 3))}</span></button>`;
        }).join("")}
      </div>
    </div>
    ${blocJour(d)}`;
}

export const vue = {
  titre: "Agenda",
  rendu() {
    const d = dateSel || aujourdhui();
    return `<div class="titre-page"><div><h2>Rendez-vous</h2><p>Calendrier commun</p></div>
        ${d !== aujourdhui() ? `<button type="button" class="bouton secondaire petit" data-aujourdhui>Aujourd'hui</button>` : ""}</div>
      <div class="segments">
        ${[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"]].map(([m, l]) => `<button type="button" data-mode="${m}" class="${mode === m ? "actif" : ""}">${l}</button>`).join("")}
      </div>
      ${mode === "jour" ? rendreJour(d) : mode === "semaine" ? rendreSemaine(d) : rendreMois(d)}`;
  },
  fab: () => ouvrirFormRdv(null, dateSel && dateSel >= aujourdhui() ? dateSel : aujourdhui()),
  monter(el, rerendre) {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-lien]")) return; // lien vers la carte
      const m = e.target.closest("[data-mode]");
      if (m) { mode = m.dataset.mode; return rerendre(); }
      const dc = e.target.closest("[data-decaler]");
      if (dc) { dateSel = ajouterJours(dateSel || aujourdhui(), Number(dc.dataset.decaler)); return rerendre(); }
      const dm = e.target.closest("[data-decaler-mois]");
      if (dm) { dateSel = ajouterMois(dateSel || aujourdhui(), Number(dm.dataset.decalerMois)); return rerendre(); }
      const c = e.target.closest("[data-choisir]");
      if (c) { dateSel = c.dataset.choisir; return rerendre(); }
      if (e.target.closest("[data-aujourdhui]")) { dateSel = aujourdhui(); return rerendre(); }
      const n = e.target.closest("[data-nouveau-rdv]");
      if (n) return ouvrirFormRdv(null, n.dataset.nouveauRdv);
      const o = e.target.closest("[data-ouvrir-rdv]");
      if (o) return ouvrirFormRdv(o.dataset.ouvrirRdv);
    });
  }
};
