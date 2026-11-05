/* =========================================================
   Couche de données — Firebase (Authentication + Firestore)
   - Synchronisation en temps réel (onSnapshot)
   - Cache hors ligne persistant : les modifications faites sans
     connexion sont gardées sur le téléphone et envoyées au retour
     du réseau.
   - Les écritures ne sont jamais « attendues » par l'interface :
     elles s'appliquent tout de suite localement, même hors ligne.
   ========================================================= */
import { CONFIG } from "../config.js";

const V = "11.0.2";
const URL = `https://www.gstatic.com/firebasejs/${V}`;

export async function creerBackend({ surErreur }) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${URL}/firebase-app.js`),
    import(`${URL}/firebase-auth.js`),
    import(`${URL}/firebase-firestore.js`)
  ]);

  const app = initializeApp(CONFIG.firebase);
  const auth = A.getAuth(app);
  await A.setPersistence(auth, A.browserLocalPersistence); // conservation de la session

  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
    });
  } catch (e) {
    console.warn("Cache persistant indisponible, cache mémoire utilisé.", e);
    db = F.getFirestore(app);
  }

  const chemin = (col) => F.collection(db, "foyers", CONFIG.foyerId, col);
  const docRef = (col, id) => F.doc(db, "foyers", CONFIG.foyerId, col, id);

  // ----- État de synchronisation -----
  const enAttente = new Map(); // col -> bool
  let depuisCache = false;
  const abonnesSync = new Set();
  function etatSync() {
    if (!navigator.onLine) return "hors-ligne";
    if ([...enAttente.values()].some(Boolean)) return "attente";
    if (depuisCache) return "attente";
    return "ok";
  }
  const diffuserSync = () => abonnesSync.forEach((cb) => cb(etatSync()));
  addEventListener("online", diffuserSync);
  addEventListener("offline", diffuserSync);

  const echec = (e) => {
    console.error(e);
    surErreur?.(e?.code === "permission-denied"
      ? "Accès refusé par le serveur. Reconnectez-vous."
      : "Une modification n'a pas pu être enregistrée.");
  };

  return {
    mode: "firebase",

    surAuth(cb) {
      return A.onAuthStateChanged(auth, (u) => cb(!!u));
    },

    async connecter(code) {
      try {
        await A.signInWithEmailAndPassword(auth, CONFIG.courrielFoyer, code);
      } catch (e) {
        const c = e?.code || "";
        if (c.includes("too-many-requests")) throw new Error("Trop d'essais. Patientez quelques minutes.");
        if (c.includes("network")) throw new Error("Pas de connexion Internet. La première connexion nécessite le réseau.");
        throw new Error("Code d'accès incorrect.");
      }
    },

    async deconnecter() { await A.signOut(auth); },

    async changerCode(ancien, nouveau) {
      const u = auth.currentUser;
      if (!u) throw new Error("Non connecté.");
      try {
        await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(CONFIG.courrielFoyer, ancien));
      } catch {
        throw new Error("Le code actuel est incorrect.");
      }
      try {
        await A.updatePassword(u, nouveau);
      } catch (e) {
        if ((e?.code || "").includes("weak-password")) throw new Error("Code trop faible (6 caractères minimum).");
        throw new Error("Le code n'a pas pu être changé.");
      }
    },

    async envoyerReinitialisation() {
      await A.sendPasswordResetEmail(auth, CONFIG.courrielFoyer);
    },

    premiereFois() { return false; },

    ecouter(col, cb, { ordre, sens = "asc", limite } = {}) {
      let q = chemin(col);
      const contraintes = [];
      if (ordre) contraintes.push(F.orderBy(ordre, sens));
      if (limite) contraintes.push(F.limit(limite));
      if (contraintes.length) q = F.query(q, ...contraintes);
      return F.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        enAttente.set(col, snap.metadata.hasPendingWrites);
        depuisCache = snap.metadata.fromCache;
        diffuserSync();
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), { depuisCache: snap.metadata.fromCache });
      }, (e) => { echec(e); });
    },

    async lire(col, id) {
      try {
        const s = await F.getDoc(docRef(col, id));
        return s.exists() ? { id: s.id, ...s.data() } : null;
      } catch (e) {
        console.warn(e);
        return null;
      }
    },

    nouvelId(col) { return F.doc(chemin(col)).id; },

    ajouter(col, data) {
      const ref = F.doc(chemin(col));
      F.setDoc(ref, data).catch(echec);
      return ref.id;
    },

    definir(col, id, data, { fusion = false } = {}) {
      F.setDoc(docRef(col, id), data, { merge: fusion }).catch(echec);
    },

    modifier(col, id, data) {
      // Mise à jour champ par champ : deux téléphones qui modifient des
      // champs différents en même temps ne s'écrasent pas.
      F.updateDoc(docRef(col, id), data).catch(echec);
    },

    supprimer(col, id) {
      F.deleteDoc(docRef(col, id)).catch(echec);
    },

    surEtatSync(cb) { abonnesSync.add(cb); cb(etatSync()); return () => abonnesSync.delete(cb); }
  };
}
