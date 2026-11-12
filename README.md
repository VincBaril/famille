# FAMILLE — application mobile de la maison

Application privée pour deux personnes : **tableau de bord du jour, épicerie, tâches (avec historique permanent), menu de la semaine et recettes, rendez-vous, notes et notifications**. Entièrement en français, installable sur Android sans Google Play, synchronisée en temps réel entre les deux téléphones, **sans aucun frais mensuel**.

---

## Sommaire

1. [Ce que contient le projet](#1-ce-que-contient-le-projet)
2. [Technologies et coûts (tout est gratuit)](#2-technologies-et-coûts)
3. [Essayer tout de suite (mode démo)](#3-essayer-tout-de-suite-mode-démo)
4. [Déploiement pas à pas](#4-déploiement-pas-à-pas)
5. [Installation sur les deux téléphones Android](#5-installation-sur-les-deux-téléphones-android)
6. [Le code d'accès commun](#6-le-code-daccès-commun)
7. [Structure de la base de données](#7-structure-de-la-base-de-données)
8. [Sécurité](#8-sécurité)
9. [Synchronisation, hors ligne et modifications simultanées](#9-synchronisation-hors-ligne-et-modifications-simultanées)
10. [Notifications](#10-notifications)
11. [Mettre l'application à jour](#11-mettre-lapplication-à-jour)
12. [Ajouter un utilisateur plus tard](#12-ajouter-un-utilisateur-plus-tard)
13. [Limites connues](#13-limites-connues)
14. [Tests](#14-tests)
15. [Calendriers Outlook (facultatif)](#15-calendriers-outlook-facultatif)

---

## 1. Ce que contient le projet

```
famille/
├── app/                          ← l'application (publiée sur GitHub Pages)
│   ├── index.html
│   ├── manifest.webmanifest      ← nom, icône, plein écran (installation Android)
│   ├── sw.js                     ← fonctionnement hors ligne + réception des notifications
│   ├── css/style.css             ← palette vert doux / beige / blanc / gris foncé
│   ├── icons/                    ← icônes de l'application (PNG + SVG)
│   └── js/
│       ├── config.js             ← ⚙️ LE SEUL FICHIER À REMPLIR
│       ├── app.js                ← démarrage, connexion, navigation
│       ├── etat.js               ← données partagées en temps réel
│       ├── notifications.js
│       ├── donnees/firebase.js   ← synchronisation (Firebase)
│       ├── donnees/local.js      ← mode démo (sans serveur)
│       └── vues/                 ← accueil, épicerie, tâches, menu, agenda, notes, réglages
├── firebase/firestore.rules      ← règles de sécurité de la base de données
├── notifier/                     ← programme d'envoi des rappels (application fermée)
├── outils/generer-cles-vapid.html← génère les clés de notification dans votre navigateur
└── .github/workflows/            ← publication automatique + rappels toutes les 10 min
```

## 2. Technologies et coûts

| Besoin | Solution | Coût |
|---|---|---|
| Application installable (icône, plein écran, sans Play Store) | Application web progressive (PWA), HTML/CSS/JavaScript sans compilation | 0 $ |
| Hébergement de l'application | **GitHub Pages** | 0 $ |
| Base de données partagée + temps réel + hors ligne | **Firebase Firestore**, forfait gratuit « Spark » | 0 $ |
| Code d'accès (chiffré, jamais dans le code) | **Firebase Authentication** (courriel + mot de passe) | 0 $ |
| Notifications, même application fermée | **Web Push** (standard) + petit programme lancé par **GitHub Actions** toutes les 10 min | 0 $ |
| Photos des recettes | Compressées sur le téléphone et rangées dans Firestore | 0 $ |

**Services payants évités, et l'alternative gratuite choisie :**

- *Firebase Cloud Functions* (pour planifier les rappels) exige le forfait payant « Blaze ». → Remplacé par **GitHub Actions**, gratuit.
- *Firebase Storage* (pour les photos) exige aussi le forfait « Blaze » pour les nouveaux projets. → Les photos sont **réduites à environ 100 Ko** et stockées dans Firestore.

Le forfait gratuit de Firestore (50 000 lectures et 20 000 écritures par jour, 1 Go de données) est très largement suffisant pour deux personnes. **Aucune carte de crédit n'est demandée.**

## 3. Essayer tout de suite (mode démo)

Tant que `app/js/config.js` n'est pas rempli, FAMILLE démarre en **mode démo** : tout fonctionne, mais les données restent sur l'appareil (pas de synchronisation).

- **Le plus simple :** faites l'étape 3 du déploiement (GitHub Pages) d'abord ; l'adresse obtenue ouvre l'application en mode démo.
- **Sur un ordinateur :** dans le dossier `app`, lancez `python3 -m http.server 8000`, puis ouvrez `http://localhost:8000`. Ouvrez deux onglets pour voir la synchronisation entre « téléphones ».

## 4. Déploiement pas à pas

Comptez environ 30 à 45 minutes, une seule fois. Il faut un compte Google (pour Firebase) et un compte GitHub (gratuit).

### Étape 1 — Créer la base de données (Firebase)

1. Allez sur <https://console.firebase.google.com> → **Créer un projet** → nom : `famille` → vous pouvez désactiver Google Analytics → **Créer**.
2. Menu **Authentication** → **Commencer** → onglet **Mode de connexion** → **Adresse e-mail/Mot de passe** → **Activer** → Enregistrer.
3. Onglet **Utilisateurs** → **Ajouter un utilisateur** :
   - **Adresse e-mail** : une vraie adresse à vous (ex. celle du foyer). Elle sert d'« identifiant du compte » et permet de réinitialiser le code en cas d'oubli.
   - **Mot de passe** : c'est **le code d'accès commun** (8 caractères ou plus recommandé, 6 minimum).
4. Onglet **Paramètres** → **Actions des utilisateurs** → **décochez « Activer la création (inscription) »** si l'option est présente. Personne ne pourra créer d'autre compte. *(Même sans cette option, les règles de sécurité bloquent tout autre compte.)*
5. Menu **Firestore Database** → **Créer une base de données** → emplacement **`northamerica-northeast1 (Montréal)`** → **mode production** → Créer.
6. Onglet **Règles** → effacez tout → collez le contenu de `firebase/firestore.rules` → **remplacez `courriel-du-foyer@exemple.com` par votre adresse de l'étape 3** → **Publier**.

### Étape 2 — Relier l'application à Firebase

1. Firebase → ⚙️ **Paramètres du projet** → section **Vos applications** → icône **`</>`** (Web) → surnom `FAMILLE` → ne cochez pas « Hosting » → **Enregistrer l'application**.
2. Copiez les valeurs de l'objet `firebaseConfig` affiché.
3. Ouvrez `app/js/config.js` et remplissez :
   ```js
   firebase: {
     apiKey: "AIza…",
     authDomain: "famille-xxxxx.firebaseapp.com",
     projectId: "famille-xxxxx",
     storageBucket: "famille-xxxxx.firebasestorage.app",
     messagingSenderId: "123…",
     appId: "1:123…:web:…"
   },
   courrielFoyer: "votre-adresse@exemple.com",   // celle de l'étape 1.3
   ```
   Ces valeurs ne sont pas secrètes (Firebase les conçoit pour être publiques). **Ne mettez jamais le code d'accès dans ce fichier.**

### Étape 3 — Publier l'application (GitHub Pages)

1. Créez un compte sur <https://github.com> si nécessaire.
2. **New repository** → nom : `famille` → **Public** (voir la note plus bas) → Create.
3. **Envoyer les fichiers** : le plus simple est l'application gratuite **GitHub Desktop** (glissez le dossier `famille`, puis « Commit » et « Push »). Sur le site, « Add file → Upload files » fonctionne aussi, mais certains ordinateurs cachent le dossier `.github` : vérifiez qu'il est bien envoyé.
4. Dans le dépôt : **Settings** → **Pages** → **Source : GitHub Actions**.
5. Onglet **Actions** : le flux « Publier l'application » s'exécute (1 à 2 min). Votre application est à l'adresse :
   **`https://VOTRE-NOM.github.io/famille/`**
6. Par précaution, dans Firebase → **Authentication** → **Paramètres** → **Domaines autorisés** → ajoutez `VOTRE-NOM.github.io`.

> **Pourquoi un dépôt public ?** Les rappels tournent toutes les 10 minutes ; GitHub Actions est illimité et gratuit pour les dépôts publics. Le code est visible, mais **il ne contient aucun secret** : le code d'accès est chez Firebase (chiffré), les clés privées sont dans les « Secrets » GitHub (jamais visibles), et les données sont protégées par les règles Firestore.
> **Vous préférez un dépôt privé ?** C'est possible : modifiez `.github/workflows/rappels.yml` et remplacez `*/10` par `*/30` (rappels aux 30 minutes) pour rester dans les 2 000 minutes gratuites par mois.

### Étape 4 — Activer les notifications (application fermée)

1. **Clés de notification.** Ouvrez `outils/generer-cles-vapid.html` sur votre ordinateur (double-clic) → **Générer les clés**. Rien n'est envoyé sur Internet.
   - Copiez la **clé publique** dans `app/js/config.js` → `vapidPublicKey: "…"`, puis renvoyez ce fichier sur GitHub.
2. **Clé du compte de service.** Firebase → ⚙️ Paramètres du projet → **Comptes de service** → **Générer une nouvelle clé privée** → un fichier `.json` est téléchargé.
3. GitHub → votre dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, quatre fois :

   | Nom du secret | Valeur |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | tout le contenu du fichier `.json` (ouvrez-le avec le Bloc-notes, copiez tout) |
   | `VAPID_PUBLIC_KEY` | la clé publique |
   | `VAPID_PRIVATE_KEY` | la clé privée |
   | `VAPID_CONTACT` | `mailto:votre-adresse@exemple.com` |

   Supprimez ensuite le fichier `.json` de votre ordinateur.
4. *(Facultatif)* Onglet **Variables** : `FUSEAU` (par défaut `America/Toronto`) et `HEURE_RESUME` (heure du résumé du matin, par défaut `7`).
5. Onglet **Actions** → « Rappels FAMILLE » → **Run workflow** pour un premier essai. Le journal doit afficher « … notification(s) envoyée(s) ».

## 5. Installation sur les deux téléphones Android

À faire sur **chacun** des deux téléphones :

1. Ouvrez **Chrome** et allez à `https://VOTRE-NOM.github.io/famille/`.
2. Entrez le **code d'accès commun**.
3. Choisissez **qui utilise ce téléphone** (vous pourrez renommer « Personne 1 » et « Personne 2 » dans ⚙️ Réglages → Personnes du foyer).
4. Menu **⋮** de Chrome → **Installer l'application** (ou « Ajouter à l'écran d'accueil ») → **Installer**. L'icône FAMILLE apparaît ; l'application s'ouvre en plein écran, comme une application normale.
5. Ouvrez FAMILLE depuis l'icône → ⚙️ **Réglages** → **Notifications** → activez → **Autoriser**. Touchez « Envoyer une notification de test ».
6. Conseil : Paramètres Android → Applications → **Chrome** → Batterie → **Non restreinte**, pour que les notifications arrivent sans délai.

La session reste ouverte : le code n'est plus demandé, sauf après une déconnexion ou un changement de code.

## 6. Le code d'accès commun

- **Le définir :** c'est le mot de passe du compte créé à l'étape 1.3.
- **Le changer :** dans l'application, ⚙️ Réglages → **Changer le code d'accès** (il faut le code actuel). L'autre téléphone devra peut-être entrer le nouveau code.
- **Code oublié :** sur l'écran de connexion, touchez **« Code oublié ? »** : un courriel de réinitialisation est envoyé à l'adresse du foyer.
- **Où est-il stocké ?** Uniquement chez Firebase Authentication, sous forme chiffrée (hachage). **Il n'apparaît nulle part dans le code source.** En mode démo, seule une empreinte SHA-256 est gardée sur l'appareil.

## 7. Structure de la base de données

Toutes les données sont sous `foyers/principal/…` (un « foyer » = une maison ; la structure permet d'en ajouter d'autres).

| Collection | Contenu d'un document |
|---|---|
| `epicerie` | `nom`, `quantite`, `categorie`, `commentaire`, `achete` (vrai/faux), `ajoutePar`, `creeLe`, `modifieLe` |
| `taches` | `titre`, `description`, `responsable` (id de personne ou `tous`), `echeance` (AAAA-MM-JJ), `heure`, `priorite` (`basse`/`normale`/`haute`), `rappel` (minutes avant), `rappelA` (horodatage), `rappelEnvoye`, `statut` (`a_faire`/`terminee`), `creeLe`, `termineeLe` |
| `historique` | **permanent** : `titre`, `responsable`, `responsableNom`, `creeLe` (création), `realiseeLe` (réalisation), `realiseePar` |
| `repas` | identifiant = la date (AAAA-MM-JJ) : `nom`, `description`, `recetteId`, `ingredients` [{`nom`, `quantite`}], `commentaires` |
| `recettes` | `nom`, `description`, `ingredients` [{`nom`, `quantite`}], `instructions`, `tempsPrep` (min), `portions`, `aPhoto`, `vignette` (petite image) |
| `photos` | identifiant = celui de la recette : `data` (photo compressée) |
| `rendezvous` | `titre`, `description`, `date`, `heureDebut`, `heureFin`, `adresse`, `personne`, `notes`, `rappel` (15/30/60/1440 min), `important`, `debutA`, `rappelA`, `rappelEnvoye` |
| `notes` | `titre`, `texte`, `date`, `epinglee`, `creeLe`, `modifieLe` |
| `personnes` | `nom`, `couleur`, `ordre` |
| `reglages` | document `general` : `categoriesPerso` (catégories d'épicerie ajoutées), `dernierResume` |
| `appareils` | un par téléphone abonné : `abonnement` (Web Push), `personneId`, `prefs` (types de notifications), `nom` |

## 8. Sécurité

- **Accès privé :** seules les personnes connectées avec le compte du foyer peuvent lire ou écrire (règles dans `firebase/firestore.rules`). Tout le reste est refusé.
- **Historique protégé :** les règles interdisent de modifier ou de supprimer l'historique des tâches.
- **Protection contre l'essai de codes :** Firebase bloque temporairement après plusieurs codes erronés. Choisissez un code de 8 caractères ou plus.
- **Secrets :** la clé privée VAPID et la clé du compte de service sont uniquement dans les Secrets GitHub.
- **Connexion chiffrée** (HTTPS) partout.
- **Déconnexion d'un téléphone perdu :** changez le code d'accès depuis l'autre téléphone ; le téléphone perdu ne pourra plus synchroniser.

## 9. Synchronisation, hors ligne et modifications simultanées

- **Temps réel :** chaque modification apparaît sur l'autre téléphone en une ou deux secondes. Le témoin en haut à droite indique « Synchronisé », « Envoi… » ou « Hors ligne ».
- **Pertes de connexion :** l'application continue de fonctionner. Les modifications sont gardées sur le téléphone et **envoyées automatiquement au retour du réseau**. Un bandeau gris l'indique.
- **Modifications simultanées :** les changements sont enregistrés **champ par champ** : si l'un coche « Lait » pendant que l'autre change sa quantité, les deux changements sont conservés. Si les deux modifient exactement le même champ au même moment, la dernière modification reçue l'emporte.
- **Doublons d'épicerie :** la comparaison ignore majuscules, accents et pluriels (« Tomates » = « tomate ») et est refaite au moment de confirmer, au cas où l'autre téléphone aurait ajouté le produit entre-temps.
- **Premier lancement :** une connexion Internet est nécessaire ; ensuite l'application s'ouvre même hors ligne.

## 10. Notifications

| Type | Quand | Qui la reçoit |
|---|---|---|
| Rendez-vous | 15 min, 30 min, 1 h ou 1 jour avant (au choix) | la personne concernée (ou les deux) |
| Rappel de tâche | à l'heure prévue, ou 15 min / 30 min / 1 h / 1 jour avant | la personne responsable (ou les deux) |
| Résumé du matin | chaque jour à 7 h : tâches du jour + souper | chaque téléphone, selon ses tâches |
| Tâches en retard | chaque matin, s'il y en a | chaque téléphone, selon ses tâches |

Chaque type s'active ou se désactive dans ⚙️ Réglages, **téléphone par téléphone**. Les rappels fonctionnent **même si l'application est fermée** (programme `notifier/` lancé par GitHub Actions).

## 11. Mettre l'application à jour

1. Modifiez les fichiers dans `app/`.
2. Dans `app/sw.js`, augmentez `VERSION` (ex. `famille-v1.0.1`) pour que les téléphones téléchargent la nouvelle version.
3. Envoyez sur GitHub : la publication est automatique. Les téléphones reçoivent la mise à jour à la prochaine ouverture.

## 12. Ajouter un utilisateur plus tard

- **Une personne de plus qui partage le même code :** ⚙️ Réglages → **Ajouter une personne**. Rien d'autre à faire.
- **Un compte avec son propre code :** Firebase → Authentication → Ajouter un utilisateur, puis ajoutez son courriel dans la liste de `estMembre()` dans les règles Firestore et republiez. *(L'écran de connexion actuel utilise le courriel du foyer ; un écran « courriel + code » serait alors à ajouter.)*

## 13. Limites connues

- **Précision des rappels :** GitHub lance les rappels environ toutes les 10 minutes, avec parfois un retard de 5 à 15 minutes aux heures chargées. Pour un rendez-vous important, choisissez « 30 minutes » ou « 1 heure avant ».
- GitHub suspend les tâches planifiées d'un dépôt inactif depuis 60 jours ; le flux « Rappels » fait automatiquement un petit enregistrement vide aux 45 jours pour l'éviter.
- Pensé pour **Chrome sur Android**. Il fonctionne aussi sur ordinateur ; sur iPhone, les notifications exigent iOS 16.4 ou plus et l'ajout à l'écran d'accueil.
- **Photos :** une par recette, réduite automatiquement (largeur maximale 900 px).

## 14. Tests

- **Calendriers Outlook :** `cd notifier && node test-calendriers.js` (14 tests : fuseaux d'Outlook, changement d'heure, récurrences hebdomadaires, mensuelles « 2e mardi », annuelles, exceptions, journées entières, fusion des deux calendriers, doublons).
- **Logique des rappels :** `cd notifier && node test-logique.js` (10 tests : rendez-vous, rappels de tâches, préférences, ciblage par personne, résumé du matin unique par jour).
- **Application :** testée en mode démo dans Chrome mobile (390 px) sur deux onglets simultanés : connexion et création du code, choix de la personne, épicerie (ajout, anti-doublons, catégories, achat, modification), tâches (création, rappel, retard, complétion, historique conservé après suppression), menu et recettes (photo, planification, import des ingrédients sans doublons), agenda (jour, semaine, mois, rappel), notes épinglées, tableau de bord, synchronisation entre onglets, changement de code, déconnexion, hors ligne et service worker. **36 vérifications réussies, aucune erreur JavaScript.**
- **À vérifier une fois Firebase configuré :** la synchronisation réelle entre les deux téléphones et la réception des notifications (bouton de test + « Run workflow »).

## 15. Calendriers Outlook (facultatif)

Les rendez-vous de vos calendriers Outlook **personnels** (Outlook.com, Hotmail) s'affichent dans l'agenda et sur l'accueil de FAMILLE, avec l'étiquette **Outlook**. C'est en **lecture seule** : on les modifie dans Outlook.

**Fonctionnement**
- Le programme des rappels lit les calendriers environ **toutes les 30 minutes** (période : 30 jours en arrière, 4 mois en avant). Microsoft peut aussi prendre un certain temps à mettre à jour un calendrier publié.
- Un même rendez-vous présent dans les deux calendriers (même invitation, ou même titre, date et heure) s'affiche **une seule fois**, avec « Les deux ».
- Un rendez-vous Outlook identique à un rendez-vous déjà entré dans FAMILLE est caché, et ne donne pas de deuxième rappel.
- Rappel : **1 heure avant** par défaut, envoyé seulement à la personne concernée (ou aux deux). Aucun rappel pour les événements d'une journée entière. Pour changer : variable GitHub `RAPPEL_OUTLOOK` (nombre de minutes, ou `aucun`).

**Installation**
1. Pour chaque personne, dans Outlook sur le Web : ⚙️ Paramètres → **Calendrier** → **Calendriers partagés** → section **Publier un calendrier** → choisir le calendrier et **« Peut afficher les titres et les lieux »** → **Publier**. Copiez le lien **ICS** (pas le lien HTML).
2. GitHub → Settings → Secrets and variables → Actions → **New repository secret** :
   - `CALENDRIER_PERSONNE_1` : le lien ICS de la personne 1 (celle qui s'appelait « Personne 1 » au départ)
   - `CALENDRIER_PERSONNE_2` : le lien ICS de la personne 2
3. Onglet **Actions** → « Rappels FAMILLE » → **Run workflow** : la synchronisation se fait immédiatement. Le journal indique seulement des nombres (« Outlook : 2 calendrier(s), 14 rendez-vous… »), **jamais** de titre ni de lien.

**Confidentialité :** quiconque possède un lien ICS peut lire le calendrier ; ne le mettez que dans les Secrets GitHub. Pour couper l'accès, annulez la publication dans Outlook (le lien cesse de fonctionner) et supprimez le secret.
