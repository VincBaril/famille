/* =========================================================
   RÉGLAGES — personnes, notifications, code d'accès
   ========================================================= */
import { db, moi, definirMoi, personnes, COULEURS, etat } from "../etat.js";
import { icone } from "../icones.js";
import { ouvrirFeuille, confirmer, toast, valeursFormulaire } from "../ui.js";
import { esc } from "../utils.js";
import { MODE_DEMO, VERSION, CONFIG } from "../config.js";
import * as N from "../notifications.js";

let etatSyncTexte = "";
export function majEtatSyncTexte(t) { etatSyncTexte = t; }

export function ouvrirChoixPersonne({ obligatoire = false } = {}) {
  const ps = personnes();
  const { el, fermer } = ouvrirFeuille({
    titre: "Qui utilise ce téléphone ?",
    contenu: `<p class="muet" style="margin-top:0">Sert à proposer vos tâches par défaut et à cibler vos notifications.</p>
      <div style="display:grid;gap:10px">${ps.map((p) => `
        <button type="button" class="bouton ${p.id === moi() ? "" : "secondaire"} large" data-moi="${p.id}" style="justify-content:flex-start">
          <span class="pastille-couleur" style="background:${p.couleur}"></span> ${esc(p.nom)}</button>`).join("")}</div>
      <p class="petit muet">Vous pourrez renommer les personnes dans les réglages.</p>`
  });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-moi]");
    if (!b) return;
    definirMoi(b.dataset.moi);
    N.majPersonne();
    fermer();
    toast("C'est noté !");
    dispatchEvent(new Event("famille:rerendre"));
  });
  if (obligatoire) el.querySelector("[data-fermer]").hidden = true;
}

function ouvrirFormPersonne(id) {
  const p = id ? etat.personnes.find((x) => x.id === id) : null;
  const ps = personnes();
  const v = p || { nom: "", couleur: COULEURS[ps.length % COULEURS.length] };
  const { el, fermer } = ouvrirFeuille({
    titre: p ? "Modifier la personne" : "Ajouter une personne",
    contenu: `<form id="form-personne" autocomplete="off">
      <label class="champ"><span>Prénom</span><input name="nom" required maxlength="30" value="${esc(v.nom)}" autofocus></label>
      <div class="champ"><span class="libelle">Couleur</span><div class="couleurs">${COULEURS.map((c) => `
        <label><input type="radio" name="couleur" value="${c}" ${c === v.couleur ? "checked" : ""}><span style="background:${c}"></span></label>`).join("")}</div></div>
    </form>`,
    actions: `${p && ps.length > 2 ? `<button type="button" class="bouton danger" data-supprimer style="flex:0 0 auto">${icone("poubelle")}</button>` : ""}
      <button type="submit" form="form-personne" class="bouton">${icone("coche")} Enregistrer</button>`
  });
  el.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = valeursFormulaire(e.target);
    if (!d.nom) return;
    if (p) db().modifier("personnes", p.id, { nom: d.nom, couleur: d.couleur || v.couleur });
    else db().definir("personnes", "p" + Date.now().toString(36), { nom: d.nom, couleur: d.couleur || v.couleur, ordre: ps.length + 1 });
    fermer(); toast("Enregistré");
  });
  el.querySelector("[data-supprimer]")?.addEventListener("click", async () => {
    if (await confirmer(`Retirer ${p.nom} ? Ses tâches resteront attribuées à son ancien identifiant.`, { ok: "Retirer", danger: true })) {
      db().supprimer("personnes", p.id); fermer();
    }
  });
}

function ouvrirChangerCode() {
  const { el, fermer } = ouvrirFeuille({
    titre: "Changer le code d'accès",
    contenu: `<form id="form-code" autocomplete="off">
      <label class="champ"><span>Code actuel</span><input type="password" name="ancien" required autocomplete="current-password"></label>
      <label class="champ"><span>Nouveau code (8 caractères ou plus recommandé)</span><input type="password" name="nouveau" required minlength="6" autocomplete="new-password"></label>
      <label class="champ"><span>Confirmer le nouveau code</span><input type="password" name="confirmation" required minlength="6" autocomplete="new-password"></label>
      <p class="erreur" data-erreur></p>
      <p class="petit muet">Après le changement, l'autre téléphone devra peut-être entrer le nouveau code.</p>
    </form>`,
    actions: `<button type="submit" form="form-code" class="bouton">${icone("cadenas")} Changer le code</button>`
  });
  const form = el.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = valeursFormulaire(form);
    const err = form.querySelector("[data-erreur]");
    if (d.nouveau !== d.confirmation) { err.textContent = "Les deux nouveaux codes ne correspondent pas."; return; }
    if (d.nouveau.length < 6) { err.textContent = "Le code doit contenir au moins 6 caractères."; return; }
    try { await db().changerCode(d.ancien, d.nouveau); fermer(); toast("Code d'accès changé"); }
    catch (x) { err.textContent = x.message; }
  });
}

export const vue = {
  titre: "Réglages",
  rendu() {
    const ps = personnes();
    const app = N.infosAppareil();
    const perm = N.permission();
    const actif = app.actif && perm === "granted";
    const pmoi = ps.find((p) => p.id === moi());
    return `<div class="titre-page"><div><h2>Réglages</h2><p>FAMILLE ${VERSION}${MODE_DEMO ? " · mode démo" : ""}</p></div></div>

    ${MODE_DEMO ? `<div class="carte" style="background:var(--ambre-pale)"><b>Mode démo</b><p class="petit" style="margin:4px 0 0">Les données restent sur cet appareil. Suivez le guide d'installation (README) pour activer la synchronisation entre les deux téléphones.</p></div>` : ""}

    <h3 class="section">Ce téléphone</h3>
    <div class="carte">
      <div class="reglage-ligne"><div><div class="petit muet">Utilisé par</div><b>${pmoi ? esc(pmoi.nom) : "Non choisi"}</b></div>
        <button type="button" class="bouton secondaire petit" data-choisir-moi>Changer</button></div>
    </div>

    <h3 class="section">Personnes du foyer</h3>
    <div class="carte">
      ${ps.map((p) => `<div class="reglage-ligne"><div style="display:flex;gap:10px;align-items:center"><span class="pastille-couleur" style="background:${p.couleur}"></span><b>${esc(p.nom)}</b></div>
        <button type="button" class="bouton-icone" data-modifier-personne="${p.id}" aria-label="Modifier ${esc(p.nom)}">${icone("crayon")}</button></div>`).join("")}
      <button type="button" class="bouton discret petit" data-ajouter-personne style="margin-top:8px">${icone("plus")} Ajouter une personne</button>
    </div>

    <h3 class="section">${icone("cloche")} Notifications</h3>
    <div class="carte">
      ${!N.estSupporte() ? `<p class="vide">Ce navigateur ne permet pas les notifications. Utilisez Chrome sur Android.</p>` : `
      <label class="interrupteur"><span><b>Activer sur ce téléphone</b>${perm === "denied" ? `<br><span class="petit" style="color:var(--rouge)">Bloquées dans les paramètres Android</span>` : ""}</span>
        <input type="checkbox" data-notif-actif ${actif ? "checked" : ""}></label>
      ${actif ? `
        <label class="interrupteur"><span>Rendez-vous</span><input type="checkbox" data-pref="rendezvous" ${app.prefs.rendezvous ? "checked" : ""}></label>
        <label class="interrupteur"><span>Tâches à effectuer (résumé du matin)</span><input type="checkbox" data-pref="taches" ${app.prefs.taches ? "checked" : ""}></label>
        <label class="interrupteur"><span>Tâches en retard</span><input type="checkbox" data-pref="retard" ${app.prefs.retard ? "checked" : ""}></label>
        <label class="interrupteur"><span>Rappels programmés des tâches</span><input type="checkbox" data-pref="rappels" ${app.prefs.rappels ? "checked" : ""}></label>
        <button type="button" class="bouton discret petit" data-notif-test style="margin-top:8px">Envoyer une notification de test</button>` : ""}
      ${MODE_DEMO ? `<p class="petit muet">En mode démo, les rappels s'affichent seulement quand l'application est ouverte.</p>`
        : !CONFIG.vapidPublicKey ? `<p class="petit" style="color:var(--rouge)">Clé VAPID absente dans config.js : les rappels application fermée ne sont pas encore configurés.</p>`
        : `<p class="petit muet">Les rappels sont envoyés même si l'application est fermée (vérification toutes les 10 minutes environ).</p>`}`}
    </div>

    <h3 class="section">${icone("cadenas")} Sécurité</h3>
    <div class="carte">
      <button type="button" class="bouton secondaire large" data-changer-code>${icone("cadenas")} Changer le code d'accès</button>
      <button type="button" class="bouton discret large" data-deconnexion style="margin-top:10px">${icone("deconnexion")} Se déconnecter de ce téléphone</button>
    </div>

    <h3 class="section">Synchronisation</h3>
    <div class="carte"><p style="margin:0">${esc(etatSyncTexte || "—")}</p>
      <p class="petit muet" style="margin:6px 0 0">${MODE_DEMO ? "Aucune synchronisation en mode démo." : "Les changements apparaissent sur l'autre téléphone en quelques secondes. Hors ligne, ils sont gardés et envoyés au retour du réseau."}</p></div>`;
  },
  monter(el, rerendre) {
    el.addEventListener("click", async (e) => {
      if (e.target.closest("[data-choisir-moi]")) return ouvrirChoixPersonne();
      const mp = e.target.closest("[data-modifier-personne]");
      if (mp) return ouvrirFormPersonne(mp.dataset.modifierPersonne);
      if (e.target.closest("[data-ajouter-personne]")) return ouvrirFormPersonne();
      if (e.target.closest("[data-changer-code]")) return ouvrirChangerCode();
      if (e.target.closest("[data-notif-test]")) {
        try { await N.notificationTest(); } catch (x) { toast(x.message); }
        return;
      }
      if (e.target.closest("[data-deconnexion]")) {
        if (await confirmer("Se déconnecter ? Il faudra entrer le code d'accès à nouveau.", { ok: "Se déconnecter" })) {
          if (N.infosAppareil().actif) { try { await N.desactiver(); } catch { /* ignore */ } }
          await db().deconnecter();
        }
      }
    });
    el.addEventListener("change", async (e) => {
      if (e.target.matches("[data-notif-actif]")) {
        try {
          if (e.target.checked) { await N.activer(); toast("Notifications activées"); }
          else { await N.desactiver(); toast("Notifications désactivées"); }
        } catch (x) { toast(x.message, 4500); e.target.checked = false; }
        rerendre();
      }
      if (e.target.matches("[data-pref]")) N.majPreferences({ [e.target.dataset.pref]: e.target.checked });
    });
  }
};
