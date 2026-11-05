/* Fonctions utilitaires : texte, dates, normalisation, images */

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- Dates (toujours en heure locale) ---------------- */
const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const aujourdhui = () => iso(new Date());
export function dateDe(isoStr) {
  const [y, m, d] = String(isoStr).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const ajouterJours = (isoStr, n) => { const d = dateDe(isoStr); d.setDate(d.getDate() + n); return iso(d); };
export const ajouterMois = (isoStr, n) => { const d = dateDe(isoStr); d.setDate(1); d.setMonth(d.getMonth() + n); return iso(d); };
export const debutSemaine = (isoStr) => { const d = dateDe(isoStr); d.setDate(d.getDate() - d.getDay()); return iso(d); }; // dimanche
export const ecartJours = (a, b) => Math.round((dateDe(b) - dateDe(a)) / 86400000);

const F = (o) => new Intl.DateTimeFormat("fr-CA", o);
const fJourSemaine = F({ weekday: "long" });
const fDateLongue = F({ day: "numeric", month: "long", year: "numeric" });
const fDateMoyenne = F({ weekday: "long", day: "numeric", month: "long" });
const fDateCourte = F({ weekday: "short", day: "numeric", month: "short" });
const fJourMois = F({ day: "numeric", month: "short" });
const fMoisAnnee = F({ month: "long", year: "numeric" });
const fJourCourt = F({ weekday: "short" });

export const jourSemaine = (s) => fJourSemaine.format(dateDe(s));
export const dateLongue = (s) => fDateLongue.format(dateDe(s));
export const dateMoyenne = (s) => fDateMoyenne.format(dateDe(s));
export const dateCourte = (s) => fDateCourte.format(dateDe(s));
export const jourMois = (s) => fJourMois.format(dateDe(s));
export const moisAnnee = (s) => fMoisAnnee.format(dateDe(s));
export const jourCourt = (s) => fJourCourt.format(dateDe(s)).replace(".", "");
export const dateHeureDe = (ms) => ms ? new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)) : "—";
export const dateDeMs = (ms) => ms ? fDateLongue.format(new Date(ms)) : "—";

export function relatif(s) {
  const e = ecartJours(aujourdhui(), s);
  if (e === 0) return "Aujourd'hui";
  if (e === 1) return "Demain";
  if (e === -1) return "Hier";
  return dateCourte(s);
}

/** "14:30" → "14 h 30" ; "09:00" → "9 h" */
export function heure(h) {
  if (!h) return "";
  const [H, M] = h.split(":");
  return `${Number(H)} h${M && M !== "00" ? " " + M : ""}`;
}

/** Horodatage (ms) d'une date + heure locales */
export function horodatage(dateIso, h = "00:00") {
  const d = dateDe(dateIso);
  const [H, M] = (h || "00:00").split(":").map(Number);
  d.setHours(H || 0, M || 0, 0, 0);
  return d.getTime();
}

/* ---------------- Texte ---------------- */
const MOTS_VIDES = new Set(["de", "des", "du", "la", "le", "les", "d", "l", "un", "une", "au", "aux", "en", "a", "et"]);
/** Normalise un nom de produit pour comparer : minuscules, sans accents, au singulier. */
export function normaliser(nom) {
  return String(nom || "")
    .toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ")
    .filter((m) => m && !MOTS_VIDES.has(m))
    .map((m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m))
    .join(" ");
}

export const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const nouvelIdLocal = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------------- Catégories d'épicerie ---------------- */
export const CATEGORIES = [
  { nom: "Fruits et légumes", emoji: "🥕" },
  { nom: "Viandes et poissons", emoji: "🍗" },
  { nom: "Produits laitiers", emoji: "🧀" },
  { nom: "Boulangerie", emoji: "🥖" },
  { nom: "Épicerie sèche", emoji: "🥫" },
  { nom: "Congelés", emoji: "🧊" },
  { nom: "Produits ménagers", emoji: "🧽" },
  { nom: "Hygiène personnelle", emoji: "🧴" },
  { nom: "Autres", emoji: "🛒" }
];

const MOTS_CLES = {
  "Fruits et légumes": "pomme banane orange citron lime fraise bleuet framboise mure raisin poire peche nectarine prune ananas mangue avocat tomate laitue salade epinard roquette carotte oignon ail patate pomme de terre poivron concombre brocoli chou chou fleur celeri champignon courgette zucchini aubergine mais haricot vert persil coriandre basilic thym romarin aneth ciboulette gingembre echalote poireau radis betterave courge citrouille kale asperge pois mange tout fines herbe menthe cantaloup melon kiwi petit fruit legume fruit clementine pamplemousse cerise canneberge chou de bruxelle navet panais patate douce germe pousse",
  "Viandes et poissons": "poulet boeuf porc veau agneau dinde jambon bacon saucisse steak viande poisson saumon crevette morue tilapia truite aiglefin filet cote cotelette hache bavette rosbif pilon cuisse poitrine petoncle homard moule crabe tofu merguez chorizo salami pepperoni charcuterie",
  "Produits laitiers": "lait creme beurre fromage yogourt yaourt oeuf cheddar mozzarella parmesan feta ricotta brie creme sure fromage cottage margarine kefir creme fouettee",
  "Boulangerie": "pain baguette bagel croissant tortilla pita muffin brioche naan pain hamburger pain hot dog chausson tarte gateau",
  "Épicerie sèche": "pate spaghetti macaroni penne lasagne nouille riz farine sucre cassonade sel poivre huile vinaigre conserve sauce bouillon epice cereale gruau avoine cafe the chocolat miel sirop erable confiture beurre arachide noix amande lentille pois chiche haricot rouge haricot noir ketchup moutarde mayonnaise levure poudre pate bicarbonate vanille cannelle paprika cumin origan cari curry craquelin biscuit chip croustille couscous quinoa mais creme lait coco pate tomate tomate de salsa olive cornichon thon conserve soupe",
  "Congelés": "congele surgele creme glacee glace frite pizza congelee legume congele petit fruit congele popsicle sorbet",
  "Produits ménagers": "savon vaisselle detergent lessive essuie tout sac poubelle sac ordure eponge nettoyant javel assouplissant papier aluminium papier cire pellicule plastique ampoule pile lave vaisselle chiffon",
  "Hygiène personnelle": "shampoing shampooing revitalisant savon dentifrice brosse dent deodorant papier hygienique papier toilette rasoir mouchoir coton creme solaire serviette sanitaire tampon soie dentaire rince bouche lotion"
};
// Liste de mots-clés normalisés, triée du plus long au plus court
const INDEX_CLES = Object.entries(MOTS_CLES).flatMap(([cat, liste]) => {
  // Les expressions de plusieurs mots sont reconnues comme telles
  const expressions = [
    "pomme de terre", "chou fleur", "haricot vert", "fines herbe", "petit fruit", "patate douce", "chou de bruxelle", "mange tout",
    "creme sure", "fromage cottage", "creme fouettee", "pain hamburger", "pain hot dog", "beurre arachide", "poudre pate",
    "haricot rouge", "haricot noir", "pois chiche", "mais creme", "lait coco", "pate tomate", "tomate de", "thon conserve",
    "creme glacee", "pizza congelee", "legume congele", "petit fruit congele", "savon vaisselle", "essuie tout", "sac poubelle",
    "sac ordure", "papier aluminium", "papier cire", "pellicule plastique", "lave vaisselle", "brosse dent", "papier hygienique",
    "papier toilette", "creme solaire", "serviette sanitaire", "soie dentaire", "rince bouche", "sirop erable"
  ];
  let texte = " " + liste + " ";
  const trouves = [];
  for (const e of [...expressions].sort((a, b) => b.length - a.length)) if (texte.includes(" " + e + " ")) { trouves.push(e); texte = texte.replace(" " + e + " ", " "); }
  return [...trouves, ...texte.trim().split(/\s+/)].map((k) => [normaliser(k), cat]);
}).filter(([k]) => k).sort((a, b) => b[0].length - a[0].length);

/** Devine la catégorie d'un produit à partir de son nom */
export function devinerCategorie(nom) {
  const n = " " + normaliser(nom) + " ";
  for (const [cle, cat] of INDEX_CLES) if (n.includes(" " + cle + " ")) return cat;
  return "Autres";
}

/* ---------------- Images ---------------- */
/** Réduit une photo (pour la stocker gratuitement dans la base de données) */
export function compresserImage(fichier, tailleMax = 900, qualite = 0.72) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = rejeter;
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = rejeter;
      img.onload = () => {
        const r = Math.min(1, tailleMax / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resoudre(c.toDataURL("image/jpeg", qualite));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}
export function redimensionnerDataUrl(dataUrl, tailleMax, qualite = 0.7) {
  return new Promise((resoudre) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, tailleMax / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resoudre(c.toDataURL("image/jpeg", qualite));
    };
    img.onerror = () => resoudre(null);
    img.src = dataUrl;
  });
}

export const lienCarte = (adresse) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
