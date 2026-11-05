/* Jeu d'icônes en ligne (SVG, trait arrondi) */
const P = {
  accueil: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  epicerie: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 11.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6"/>',
  taches: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 12.2 2.8 2.8L16.5 9"/>',
  menu: '<path d="M6 3v6a3 3 0 0 0 6 0V3M9 3v18M18 21V3c-2.2 1.2-3.2 4.5-3.2 8.5H18"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  notes: '<path d="M6 3h9l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h6M8.5 13h7M8.5 17h4.5"/>',
  reglages: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  poubelle: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  crayon: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  epingle: '<path d="M9 3.5h6l-1 6 3 3.5H7l3-3.5z"/><path d="M12 13v8"/>',
  gauche: '<path d="m15 18-6-6 6-6"/>',
  droite: '<path d="m9 18 6-6-6-6"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lieu: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  personne: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cloche: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  livre: '<path d="M5 19V5a2 2 0 0 1 2-2h12v14H7a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h12"/><path d="M9 7h6"/>',
  etoile: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  historique: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v5h5"/><path d="M12 8v4.2l3 1.8"/>',
  deconnexion: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="m10 17-5-5 5-5M5 12h11"/>',
  cadenas: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chercher: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  photo: '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6 10 4h4l1.5 2"/>',
  minuteur: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v4M9.5 2.5h5"/>',
  portions: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  panier: '<path d="M4 9h16l-1.5 10a2 2 0 0 1-2 1.7h-9A2 2 0 0 1 5.5 19z"/><path d="m9 9 3-6 3 6"/>',
  synchro: '<path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  ajoutPanier: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 11.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L20 9"/><path d="M14 2v6M11 5h6"/>'
};

export function icone(nom, classe = "") {
  return `<svg class="icone ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nom] || ""}</svg>`;
}

/** Remplace les <span data-icone="nom"> statiques par leur SVG */
export function hydraterIcones(racine = document) {
  racine.querySelectorAll("[data-icone]").forEach((el) => {
    if (!el.dataset.iconeOk) { el.innerHTML = icone(el.dataset.icone); el.dataset.iconeOk = "1"; }
  });
}
