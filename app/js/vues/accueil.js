/* =========================================================
   TABLEAU DE BORD — la journée en un coup d'œil
   ========================================================= */
import { etat, moi, nomResponsable } from "../etat.js";
import { icone } from "../icones.js";
import { esc, aujourdhui, ajouterJours, jourSemaine, dateLongue, relatif, heure, dateCourte } from "../utils.js";
import { repasDu, recette, ingredientsDuRepas, ouvrirFormRepas } from "./menu.js";
import { ligneTache, basculerTache, ouvrirFormTache, trierTaches } from "./taches.js";
import { prochainsRdv, ouvrirFormRdv } from "./agenda.js";
import { articlesAAcheter, ouvrirImportIngredients } from "./epicerie.js";
import { notesTriees, ouvrirFormNote } from "./notes.js";

function salutation() {
  const h = new Date().getHours();
  const nom = moi() ? nomResponsable(moi()) : "";
  return `${h < 12 ? "Bon matin" : h < 18 ? "Bon après-midi" : "Bonsoir"}${nom && !/^Personne \d/.test(nom) ? `, ${esc(nom)}` : ""}`;
}

export const vue = {
  titre: "Accueil",
  rendu() {
    const auj = aujourdhui();

    // B. Souper
    const r = repasDu(auj);
    const rec = r?.recetteId ? recette(r.recetteId) : null;
    const ingr = ingredientsDuRepas(r);
    const carteSouper = `<section class="carte repas-du-jour" aria-label="Menu du souper">
      <div class="carte-entete"><div class="icone-ronde">${icone("menu")}</div><h3>Souper ce soir</h3>
        <a class="lien" href="#/menu">Semaine</a></div>
      ${r ? `<div class="nom-repas">${esc(r.nom)}</div>
        ${r.description ? `<div class="muet">${esc(r.description)}</div>` : ""}
        ${ingr.length ? `<ul class="liste-ingredients">${ingr.map((i) => `<li>${esc(i.nom)}${i.quantite ? ` <b>${esc(i.quantite)}</b>` : ""}</li>`).join("")}</ul>` : ""}
        ${r.commentaires ? `<p class="petit muet" style="margin:10px 0 0">💬 ${esc(r.commentaires)}</p>` : ""}
        <div class="rangee-boutons">
          ${rec ? `<a class="bouton secondaire petit" href="#/recette/${rec.id}">${icone("livre")} Recette</a>` : ""}
          <button type="button" class="bouton secondaire petit" data-modifier-souper>${icone("crayon")} Modifier</button>
          ${ingr.length ? `<button type="button" class="bouton secondaire petit" data-souper-epicerie>${icone("ajoutPanier")} À l'épicerie</button>` : ""}
        </div>`
      : `<p class="vide">Aucun souper prévu aujourd'hui.</p>
        <div class="rangee-boutons"><button type="button" class="bouton petit" data-modifier-souper>${icone("plus")} Planifier le souper</button></div>`}
    </section>`;

    // C. Tâches du jour
    const tachesJour = etat.taches.filter((t) => t.echeance === auj).sort(trierTaches);
    const retard = etat.taches.filter((t) => t.statut !== "terminee" && t.echeance && t.echeance < auj);
    const faites = tachesJour.filter((t) => t.statut === "terminee").length;
    const carteTaches = `<section class="carte" aria-label="Tâches du jour">
      <div class="carte-entete"><div class="icone-ronde">${icone("taches")}</div><h3>Tâches du jour</h3>
        <a class="lien" href="#/taches">Toutes</a></div>
      ${tachesJour.length ? `<div class="progression" role="progressbar" aria-valuenow="${faites}" aria-valuemax="${tachesJour.length}"><i style="width:${(faites / tachesJour.length) * 100}%"></i></div>
        <p class="petit muet" style="margin:0 0 4px">${faites} terminée${faites > 1 ? "s" : ""} · ${tachesJour.length - faites} restante${tachesJour.length - faites > 1 ? "s" : ""}</p>
        <ul class="liste">${tachesJour.map((t) => ligneTache(t, { montrerDate: false })).join("")}</ul>`
      : `<p class="vide">Aucune tâche prévue aujourd'hui.</p>`}
      ${retard.length ? `<p class="petit" style="margin:8px 0 0;color:var(--rouge);font-weight:700">${retard.length} tâche${retard.length > 1 ? "s" : ""} en retard</p>
        <ul class="liste">${retard.sort((a, b) => a.echeance.localeCompare(b.echeance)).slice(0, 3).map((t) => ligneTache(t)).join("")}</ul>` : ""}
      <div class="rangee-boutons"><button type="button" class="bouton secondaire petit" data-nouvelle-tache>${icone("plus")} Ajouter une tâche</button></div>
    </section>`;

    // D. Rendez-vous + rappels importants
    const rdvs = prochainsRdv(3);
    const demain = ajouterJours(auj, 1);
    const importants = [
      ...etat.rendezvous.filter((x) => x.important && x.date >= auj && x.date <= ajouterJours(auj, 7)).map((x) => `${esc(x.titre)} — ${esc(relatif(x.date))} à ${heure(x.heureDebut)}`),
      ...etat.taches.filter((t) => t.statut !== "terminee" && t.priorite === "haute" && t.echeance && t.echeance <= demain).map((t) => `${esc(t.titre)} — ${t.echeance < auj ? "en retard" : esc(relatif(t.echeance))}`)
    ];
    const carteRdv = `<section class="carte" aria-label="Rendez-vous">
      <div class="carte-entete"><div class="icone-ronde">${icone("agenda")}</div><h3>Prochains rendez-vous</h3>
        <a class="lien" href="#/agenda">Agenda</a></div>
      ${rdvs.length ? rdvs.map((x) => `<div class="rdv-mini" data-ouvrir-rdv="${x.id}" role="button" tabindex="0">
          <div class="quand"><b>${heure(x.heureDebut)}</b><small>${esc(x.date === auj ? "aujourd'hui" : x.date === demain ? "demain" : dateCourte(x.date))}</small></div>
          <div><div style="font-weight:700">${x.important ? `<span style="color:var(--ambre)">★</span> ` : ""}${esc(x.titre)}</div>
            ${x.description ? `<div class="petit muet">${esc(x.description)}</div>` : ""}
            <div class="petit muet">${esc(nomResponsable(x.personne))}${x.rappel !== null && x.rappel !== undefined ? ` · ${icone("cloche")}` : ""}</div></div>
        </div>`).join("") : `<p class="vide">Aucun rendez-vous à venir.</p>`}
      ${importants.length ? `<div class="important"><b>${icone("etoile")} À ne pas oublier</b><ul>${importants.map((t) => `<li>${t}</li>`).join("")}</ul></div>` : ""}
    </section>`;

    // E. Épicerie
    const nb = articlesAAcheter().length;
    const carteEpicerie = `<section class="carte" aria-label="Épicerie">
      <div class="carte-entete"><div class="icone-ronde">${icone("epicerie")}</div><h3>Épicerie</h3></div>
      <div class="epicerie-resume"><div class="nombre">${nb}</div>
        <div style="flex:1"><div style="font-weight:700">article${nb > 1 ? "s" : ""} à acheter</div>
        <a class="bouton petit" href="#/epicerie" style="margin-top:8px">${icone("panier")} Ouvrir la liste</a></div></div>
    </section>`;

    // F. Notes
    const notes = notesTriees().slice(0, 3);
    const carteNotes = `<section class="carte" aria-label="Notes">
      <div class="carte-entete"><div class="icone-ronde">${icone("notes")}</div><h3>Dernières notes</h3>
        <a class="lien" href="#/notes">Toutes</a></div>
      ${notes.length ? notes.map((n) => `<div class="note-mini" data-ouvrir-note="${n.id}" role="button" tabindex="0">
          <b>${n.epinglee ? "📌 " : ""}${esc(n.titre)}</b><p>${esc(n.texte)}</p></div>`).join("") : `<p class="vide">Aucune note.</p>`}
    </section>`;

    // A. Date du jour
    return `<div class="accueil-date">
        <p class="sur-titre">${salutation()}</p>
        <div class="jour">${jourSemaine(auj)}</div>
        <div class="date">${dateLongue(auj)}</div>
      </div>
      ${carteSouper}${carteTaches}${carteRdv}${carteEpicerie}${carteNotes}`;
  },
  monter(el) {
    el.addEventListener("click", (e) => {
      const auj = aujourdhui();
      if (e.target.closest("[data-modifier-souper]")) return ouvrirFormRepas(auj);
      if (e.target.closest("[data-souper-epicerie]")) { const r = repasDu(auj); return ouvrirImportIngredients(ingredientsDuRepas(r), `Pour : ${r?.nom || ""}`); }
      const b = e.target.closest("[data-basculer-tache]");
      if (b) return basculerTache(b.dataset.basculerTache);
      const t = e.target.closest("[data-ouvrir-tache]");
      if (t) return ouvrirFormTache(t.dataset.ouvrirTache);
      if (e.target.closest("[data-nouvelle-tache]")) return ouvrirFormTache(null, { echeance: auj });
      const r = e.target.closest("[data-ouvrir-rdv]");
      if (r) return ouvrirFormRdv(r.dataset.ouvrirRdv);
      const n = e.target.closest("[data-ouvrir-note]");
      if (n) return ouvrirFormNote(n.dataset.ouvrirNote);
    });
  }
};
