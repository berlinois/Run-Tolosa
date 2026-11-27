# Run Tolosa

Appli Android perso pour colorier, sur la carte de Toulouse, toutes les rues
dans lesquelles je suis passé en marchant. Tout reste sur le téléphone : pas
de serveur, pas de compte, pas d'abonnement. **Coût : 0 €.**

## Features

Légende : ✅ fait · 🧪 en test · ⏳ prévu · 💡 idée

- ✅ **Carte de Toulouse**
  - Fond de carte OpenFreeMap affiché avec MapLibre, sans clé d'API
  - **Fonds de carte** : bouton rond « calques », puis un panneau avec **Clair** (par défaut), **Plan**, **Sombre** (OpenFreeMap), **Plan IGN** et **Photo aérienne** (IGN Géoplateforme). Tous sont gratuits et sans clé, et le choix est retenu
  - **Me localiser** : la carte se centre sur ta position à l'ouverture. Le bouton rond 📍 affiche ta position et la précision du GPS pendant 4 s
  - **Légende** : couleurs des rues, km validés et parcourus, version installée
- ✅ **Enregistrer une marche**
  - Bouton « Démarrer / Arrêter ». Le GPS est lu toutes les 2 s, **même écran éteint**, avec une notification qui affiche la distance et un bouton Arrêter
  - **Suivi en direct** : chrono, distance, nombre de points, trace en cours en **bleu**
  - **Marche trop courte** : à l'arrêt d'une marche de moins de 5 min, une popup propose **Supprimer** (rouge, définitif) ou **Sauvegarder quand même**
  - **Données brutes conservées** : chaque point GPS est écrit dès sa réception et n'est jamais modifié
- ✅ **Rues parcourues**
  - Chaque **rue entière** (tronçons voisins de même nom) est jugée sur ta **meilleure marche**, sans cumul entre marches
  - **Doré** (validée) : la partie manquante fait au plus 10 m + 3 % de la longueur de la rue
  - **Rose** (parcourue) : au moins 30 % de la rue, ou au moins 300 m
  - Les traits passent au-dessus du fond de carte et sous les noms de rues. Les rues jamais parcourues n'ont pas de trait, et la trace des marches terminées n'est pas affichée
  - Bords de Garonne et canal du Midi compris. Parkings, allées privées, voies rapides et trottoirs exclus
  - **Détail d'une rue** : un tap sur une rue rose ou dorée sélectionne **toute la rue**, avec un **halo bleu** continu. La couleur ne reste que sur les **mètres réellement parcourus**. Une frontière de quartier qui suit la rue s'efface presque sous la sélection. Une carte en bas affiche le % parcouru lors de la meilleure marche, les passages, le dernier passage et les tronçons parcourus. La carte se recadre pour montrer toute la rue entre la légende et la carte de stats. Un tap ailleurs ferme tout
- 🧪 **Quartiers**
  - **104 petits quartiers** (Guilheméry, Bonhoure, Côte Pavée…), avec leur nom au centre de la zone à partir du zoom 13,5.
  - **Frontières** en pointillés **bordeaux foncé** (rose clair sur les fonds sombres) : elles restent visibles même posées sur une rue rose ou dorée
  - **Étiquettes de quartiers** : fond rose brique plein et texte blanc, avec une **mini-barre d'avancement** sous le nom (doré = validé, rose = parcouru), mise à jour à chaque marche. Même style pour les 20 grands quartiers
  - Les contours des petits quartiers viennent des IRIS (INSEE/IGN), avec les noms de quartiers OSM. Un nom de rue est remplacé par le quartier qui se trouve dans la zone, ou le plus proche (`scripts/build-neighbourhoods.mjs`)
  - **Interrupteur « 🗺 Quartiers »** (en haut à droite). **Activé** : dézoom sur tout Toulouse, avec les **20 grands quartiers** teintés, en pointillés plus épais et nommés. **Désactivé** : retour aux petits quartiers, sans bouger la carte
  - ✅ **Stats d'un quartier** : un tap sur le **nom** d'un quartier met un halo bleu sur son contour et ouvre une carte de stats. On y trouve une barre validé / parcouru, les rues dorées et parcourues sur le total, les km, les marches, le dernier passage et les tronçons. La carte se recadre pour montrer tout le quartier entre la légende et la carte de stats
- ✅ **Mes données**
  - **Extraire mes marches** : bouton rond ⤓, puis une popup de confirmation. Le zip des traces brutes va dans **Téléchargements** par défaut, ou à un autre emplacement au choix
- ✅ **Appli**
  - **Écran d'accueil animé** pendant la localisation. Sur un fond bordeaux s'affichent les 1 942 km de rues de Toulouse, la Garonne, le canal et des monuments dorés (Saint-Sernin, Capitole, Pont-Neuf, la Grave, Cité de l'espace). Une **marche dorée se dessine** jusqu'à Saint-Sernin. L'écran **glisse vers le haut** quand la carte est chargée et centrée sur toi (au plus tard après 6 s). Source : `scripts/build-splash.mjs` → `public/splash.svg`
  - **Logo** : le clocher de Saint-Sernin au bout d'une marche dorée, sur fond rose brique. Icône adaptative et ronde, et écran de démarrage. Source : `design/icon.svg`, régénération : `node scripts/generate-icons.mjs`
  - **Mises à jour en un tap** via Obtainium, à chaque Release produite par la CI
- 💡 **À venir**
  - 💡 **Carte interactive des quartiers** : un tap sur un quartier zoome dessus et montre ses rues faites et pas faites
  - 💡 **Parcs** : avec plus de 50 % des chemins d'un parc parcourus, le parc entier est validé, avec une couleur dédiée
  - 💡 **Dernière marche, marche la plus longue** : mises en valeur (rose ?)
  - 💡 **Gestion des marches** : tableau des marches (date, durée, distance), avec suppression définitive des faux départs
  - ⏳ **Carte hors ligne** (Phase 3) : fond PMTiles de Toulouse embarqué
  - ⏳ **Stats globales** (Phase 4) : % de Toulouse parcouru, couleurs selon l'ancienneté

## Stack retenue

| Brique | Choix | Pourquoi |
|---|---|---|
| Interface | **Angular** | Techno déjà maîtrisée |
| Emballage Android | **Capacitor** | Transforme l'appli Angular en vrai APK et donne accès au natif |
| Carte | **MapLibre GL JS** | Open source, sans clé, coloriage des rues selon les données (*data-driven styling*) |
| Fond de carte | **OpenFreeMap** (maintenant) puis **PMTiles Protomaps** embarqué | Gratuit, puis 100 % hors ligne |
| Rues | Extrait **OpenStreetMap** de Toulouse | Gratuit, découpé en tronçons d'une intersection à l'autre |
| GPS écran éteint | **Plugin Capacitor maison en Java** (*foreground service*) | Le web peut être mis en pause par Android, le service Java non : les points sont écrits dans un fichier |
| Stockage | Fichiers JSON locaux (puis SQLite si besoin) | Simple et lisible |
| CI/CD | **GitHub Actions** | Tests, build, APK et Release à chaque push |

Le détail est dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : découpage,
flux de données et feuille de route.

## Installer l'appli et recevoir les mises à jour

Les mises à jour passent par **[Obtainium](https://github.com/ImranR98/Obtainium)**,
une appli open source qui surveille les Releases GitHub. Elle n'est pas sur le
Play Store.

1. Installer Obtainium depuis ses Releases GitHub, en prenant le fichier
   `app-arm64-v8a-release.apk`.
2. Le repo est privé : créer un token GitHub en lecture seule.
   - Le créer sur https://github.com/settings/personal-access-tokens/new, en
     type « fine-grained ».
   - Le limiter au repo `Run-Tolosa`, avec la permission **Contents: Read-only**.
   - Dans Obtainium : Réglages → Source GitHub → Personal Access Token, coller
     le token.
3. Dans Obtainium : Ajouter une appli → `https://github.com/berlinois/Run-Tolosa`
   → Installer.
4. Activer la vérification des mises à jour en arrière-plan dans les réglages
   d'Obtainium.

À chaque push, la CI publie une Release. Obtainium envoie alors une notification,
et un tap installe la nouvelle version. Les APK sont toujours signés avec la même
clé, donc la mise à jour s'installe par-dessus sans perdre les données. La version
installée est affichée en bas de la légende.

> Pas d'auto-update intégrée à l'appli : la permission `REQUEST_INSTALL_PACKAGES`
> faisait bloquer l'APK par Google Play Protect.

## Pipeline

À **chaque push**, `.github/workflows/android.yml` fait :
`npm ci` → tests (Vitest) → `ng build` → `cap sync android` → `gradlew assembleDebug`
→ APK en artefact.
Sur la **branche par défaut**, il crée en plus une Release `v0.1.<n°run>` avec l'APK.

## Dev en local

```bash
npm install
npm start                 # appli dans le navigateur, http://localhost:4200
npm test                  # tests unitaires
npm run build && npx cap sync android   # puis ouvrir android/ dans Android Studio
```
