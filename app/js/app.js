/* =========================================================
   FAMILLE — point d'entrée
   ========================================================= */
import { MODE_DEMO } from "./config.js";
import { demarrer, arreter, surChangement, etat, moi, personnes } from "./etat.js";
import { hydraterIcones, icone } from "./icones.js";
import { toast, fermerToutesFeuilles } from "./ui.js";
import { aujourdhui } from "./utils.js";
import * as N from "./notifications.js";

import { vue as accueil } from "./vues/accueil.js";
import { vue as epicerie } from "./vues/epicerie.js";
import { vue as taches } from "./vues/taches.js";
import { vue as menu, vueRecette } from "./vues/menu.js";
import { vue as agenda } from "./vues/agenda.js";
import { vue as notes } from "./vues/notes.js";
import { vue as reglages, ouvrirChoixPersonne, majEtatSyncTexte } from "./vues/reglages.js";

const ROUTES = { accueil, epicerie, taches, menu, recette: vueRecette, agenda, notes, reglages };
const NAV = { recette: "menu" };

const $ = (s) => document.querySelector(s);
let backend = null;
let vueCourante = null, routeCourante = null, paramsCourants = [], conteneurVue = null;
let choixPersonneMontre = false;

/* ---------- Service worker (installation + hors ligne + notifications) ---------- */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW :", e)));
}

/* ---------- Démarrage ---------- */
async function init() {
  hydraterIcones();
  try {
    const mod = MODE_DEMO ? await import("./donnees/local.js") : await import("./donnees/firebase.js");
    backend = await mod.creerBackend({ surErreur: (m) => toast(m, 4000) });
  } catch (e) {
    console.error(e);
    $("#demarrage").innerHTML = `<p style="letter-spacing:0;font-weight:600;max-width:300px;text-align:center;padding:0 20px">Impossible de démarrer FAMILLE.<br><span class="muet">Vérifiez la connexion Internet (nécessaire au premier lancement), puis réessayez.</span></p>
      <button class="bouton" onclick="location.reload()">Réessayer</button>`;
    return;
  }
  window.__famille = { backend, etat }; // utile pour le dépannage
  backend.surAuth((connecte) => (connecte ? afficherApp() : afficherConnexion()));
}

/* ---------- Écran de connexion ---------- */
function afficherConnexion() {
  arreter();
  fermerToutesFeuilles();
  $("#demarrage").hidden = true;
  $("#app").hidden = true;
  document.querySelector(".fab")?.remove();
  const premiere = backend.premiereFois();
  const ecran = $("#ecran-connexion");
  ecran.hidden = false;
  ecran.innerHTML = `<div class="carte-connexion">
    <img src="icons/icon-192.png" alt="">
    <h1>FAMILLE</h1>
    <p class="sous-titre">${premiere ? "Créez le code d'accès commun" : "Entrez le code d'accès commun"}</p>
    <form id="form-connexion" autocomplete="off">
      <label class="champ"><span>Code d'accès</span>
        <input class="champ-code" type="password" name="code" required minlength="${premiere ? 6 : 1}" autocomplete="current-password" autofocus></label>
      ${premiere ? `<label class="champ"><span>Confirmer le code</span><input class="champ-code" type="password" name="confirmation" required autocomplete="new-password"></label>` : ""}
      <button class="bouton large" type="submit">${icone("cadenas")} ${premiere ? "Créer et entrer" : "Entrer"}</button>
      <p class="erreur" id="erreur-connexion" role="alert"></p>
      ${!premiere && !MODE_DEMO ? `<button type="button" class="bouton discret petit large" data-oubli>Code oublié ?</button>` : ""}
    </form>
    ${MODE_DEMO ? `<p class="note-demo">Mode démo : les données restent sur cet appareil.</p>` : ""}
  </div>`;
  const form = ecran.querySelector("form");
  setTimeout(() => form.querySelector("input").focus(), 100);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = form.code.value;
    const err = $("#erreur-connexion");
    if (premiere) {
      if (code.length < 6) { err.textContent = "Au moins 6 caractères."; return; }
      if (code !== form.confirmation.value) { err.textContent = "Les deux codes ne correspondent pas."; return; }
    }
    const bouton = form.querySelector("button[type=submit]");
    bouton.disabled = true; err.textContent = "";
    try { await backend.connecter(code); }
    catch (x) { err.textContent = x.message; form.code.select(); }
    finally { bouton.disabled = false; }
  });
  form.querySelector("[data-oubli]")?.addEventListener("click", async () => {
    try { await backend.envoyerReinitialisation(); toast("Un courriel de réinitialisation a été envoyé à l'adresse du compte du foyer.", 5000); }
    catch { toast("Envoi impossible pour le moment."); }
  });
}

/* ---------- Application ---------- */
function afficherApp() {
  $("#demarrage").hidden = true;
  $("#ecran-connexion").hidden = true;
  $("#ecran-connexion").innerHTML = "";
  $("#app").hidden = false;
  choixPersonneMontre = false;
  demarrer(backend);
  backend.surEtatSync(majSync);
  naviguer();
  N.verifierAbonnement();
  N.demarrerVerificationLocale();
}

const TEXTES_SYNC = {
  ok: ["Synchronisé", "Toutes les modifications sont synchronisées."],
  attente: ["Envoi…", "Synchronisation en cours…"],
  "hors-ligne": ["Hors ligne", "Hors ligne : les modifications sont gardées sur ce téléphone et seront envoyées au retour de la connexion."]
};
function majSync(e) {
  const b = $("#etat-sync");
  b.dataset.etat = e;
  b.querySelector(".etiquette").textContent = MODE_DEMO ? "Démo" : TEXTES_SYNC[e][0];
  b.title = TEXTES_SYNC[e][1];
  $("#bandeau-hors-ligne").hidden = e !== "hors-ligne";
  majEtatSyncTexte(MODE_DEMO ? "Mode démo (données locales)." : TEXTES_SYNC[e][1]);
}
$("#etat-sync").addEventListener("click", () => toast($("#etat-sync").title));

/* ---------- Navigation ---------- */
function lireRoute() {
  const [nom, ...params] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { nom: ROUTES[nom] ? nom : "accueil", params };
}

function naviguer() {
  if ($("#app").hidden) return;
  const { nom, params } = lireRoute();
  fermerToutesFeuilles();
  if (nom !== routeCourante || nom === "recette") {
    routeCourante = nom;
    vueCourante = ROUTES[nom];
    paramsCourants = params;
    const contenu = $("#contenu");
    contenu.innerHTML = "";
    conteneurVue = document.createElement("div");
    contenu.append(conteneurVue);
    vueCourante.monter?.(conteneurVue, rendre, () => paramsCourants);
    scrollTo(0, 0);
  }
  paramsCourants = params;
  document.title = `${vueCourante.titre} · FAMILLE`;
  document.querySelectorAll(".navigation a").forEach((a) => a.classList.toggle("actif", a.dataset.route === (NAV[nom] || nom)));
  majFab();
  rendre();
}
addEventListener("hashchange", naviguer);

function majFab() {
  let fab = document.querySelector(".fab");
  if (!vueCourante?.fab) { fab?.remove(); return; }
  if (!fab) {
    fab = document.createElement("button");
    fab.type = "button"; fab.className = "fab"; fab.setAttribute("aria-label", "Ajouter");
    fab.innerHTML = icone("plus");
    fab.addEventListener("click", () => vueCourante?.fab?.());
    document.body.append(fab);
  }
}

/** Redessine la vue courante en gardant le champ en cours de saisie */
function rendre() {
  if (!conteneurVue || !vueCourante) return;
  const actif = document.activeElement;
  const garde = actif && actif.id && conteneurVue.contains(actif)
    ? { id: actif.id, valeur: actif.value, debut: actif.selectionStart, fin: actif.selectionEnd } : null;
  conteneurVue.innerHTML = vueCourante.rendu(paramsCourants);
  vueCourante.apresRendu?.(conteneurVue, paramsCourants);
  if (garde) {
    const el = document.getElementById(garde.id);
    if (el) {
      el.value = garde.valeur;
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(garde.debut, garde.fin); } catch { /* type sans sélection */ }
    }
  }
  majPastilleEpicerie();
}

function majPastilleEpicerie() {
  const n = etat.epicerie.filter((a) => !a.achete).length;
  const p = $("#pastille-epicerie");
  p.hidden = !n; p.textContent = n > 99 ? "99+" : n;
}

surChangement((col) => {
  rendre();
  if (!choixPersonneMontre && etat.pret.has("personnes") && personnes().length && (!moi() || !personnes().some((p) => p.id === moi()))) {
    choixPersonneMontre = true;
    ouvrirChoixPersonne({ obligatoire: true });
  }
});
addEventListener("famille:rerendre", rendre);

// Le tableau de bord change de jour automatiquement à minuit
let jour = aujourdhui();
setInterval(() => { if (aujourdhui() !== jour) { jour = aujourdhui(); rendre(); } }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) rendre(); });

init();
