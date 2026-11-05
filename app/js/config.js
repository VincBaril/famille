/* =========================================================
   CONFIGURATION DE FAMILLE
   ---------------------------------------------------------
   Remplissez ce fichier en suivant le README (étape 2).
   Tant que « apiKey » est vide, l'application démarre en
   MODE DÉMO : les données restent sur l'appareil, sans
   synchronisation (pratique pour essayer).

   Rien de secret ici : la configuration Web Firebase est
   publique par conception. La sécurité vient du code d'accès
   (géré et chiffré par Firebase Authentication) et des règles
   Firestore. Le code d'accès n'apparaît JAMAIS dans ce fichier.
   ========================================================= */

export const CONFIG = {
  // Collez ici l'objet « firebaseConfig » de votre projet Firebase
  firebase: {
    apiKey: "AIzaSyAmmQr4JwYFtHHlDdrODa3H_M2fNqXvGEo",
    authDomain: "famille-c60b1.firebaseapp.com",
    projectId: "famille-c60b1",
    storageBucket: "famille-c60b1.firebasestorage.app",
    messagingSenderId: "366071347860",
    appId: "1:366071347860:web:a75d4fa61fdcc72335d281"
  },

  // Courriel du compte commun créé dans Firebase Authentication.
  // Ce n'est PAS le code d'accès : c'est seulement le « nom du compte ».
  // Utilisez une vraie adresse à vous : elle permet de réinitialiser
  // le code en cas d'oubli. Doit être identique à celle de firestore.rules.
  courrielFoyer: "vinc.baril@gmail.com",

  // Identifiant du foyer dans la base de données (laisser tel quel)
  foyerId: "principal",

  // Clé publique VAPID pour les notifications (README, étape 5)
  vapidPublicKey: "BDDeAiCI45jfMqhR-V-FRrsPb4EyDCS-Wt4eOS57gFmbsgA32asFrtdL1uaf_oyP3gNygpYgn9P_hkITo_-09U8"
};

export const MODE_DEMO = !CONFIG.firebase.apiKey;
export const VERSION = "1.0.0";
