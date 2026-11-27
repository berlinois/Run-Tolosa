# Run Tolosa

Appli Android perso pour colorier, sur la carte de Toulouse, toutes les rues
dans lesquelles je suis passé en marchant. Tout reste sur le téléphone : pas
de serveur, pas de compte, pas d'abonnement. **Coût : 0 €.**

## Features

| Feature | Description | État |
|---|---|---|
| **Carte de Toulouse** | Fond de carte OpenFreeMap affiché avec MapLibre, sans clé d'API | ✅ |
| **Me localiser** | À l'ouverture, la carte se centre automatiquement sur ta position. Bouton rond 📍 : position actuelle, et précision du GPS affichée 4 s | ✅ |
| **Fonds de carte** | Bouton rond « calques », puis un panneau : **Clair** (par défaut), **Plan**, **Sombre** (OpenFreeMap), **Plan IGN**, **Photo aérienne** (IGN Géoplateforme). Tous gratuits et sans clé, le choix est retenu | ✅ |
| **Enregistrer une marche** | Bouton « Démarrer / Arrêter ». Le GPS est lu toutes les 2 s, **même écran éteint**, avec une notification qui affiche la distance et un bouton Arrêter | ✅ |
| **Marche trop courte** | À l'arrêt d'une marche de moins de 5 min, une popup « Marche trop courte » s'affiche. **Supprimer** (rouge) efface définitivement la marche, **Sauvegarder quand même** la garde | ✅ |
| **Suivi en direct** | Chrono, distance et nombre de points. Trace en cours en **bleu** | ✅ |
| **Données brutes conservées** | Chaque point GPS est écrit sur le disque dès sa réception et n'est jamais modifié | ✅ |
| **Extraire mes marches** | Bouton rond ⤓, puis une popup de confirmation. Le zip des traces brutes va dans **Téléchargements** par défaut, ou à un autre emplacement au choix | ✅ |
| **Logo** | Le clocher de Saint-Sernin au bout d'une marche dorée, avec la Garonne, sur fond rose brique. Icône Android adaptative et ronde, écran de démarrage. Source : `design/icon.svg`, régénération : `node scripts/generate-icons.mjs` | ✅ |
| **Version affichée** | En bas de la légende | ✅ |
| **Mises à jour en un tap** | Via Obtainium, à chaque Release produite par la CI | ✅ |
| **Rues parcourues** | Les tronçons OSM de la commune de Toulouse validés par tes marches (au moins 60 % du tronçon parcouru) sont tracés en **doré épais**. Le doré passe sous les noms de rues, qui restent lisibles. Les rues jamais parcourues n'ont pas de trait, et la trace GPS des marches terminées n'est pas affichée. Bords de Garonne et canal du Midi compris | ✅ |
| **Total parcouru** | Dans la légende : km de rues validées et nombre de tronçons | ✅ |
| **Quartiers (test)** | Contours des 20 quartiers officiels en pointillés rose brique, avec leur numéro et leur nom. Affichage à affiner | 🧪 |
| **Stats par quartier** | % de rues parcourues pour chaque quartier de Toulouse, en plus du % global | 💡 Idée |
| **Carte interactive des quartiers** | Un tap sur un quartier zoome dessus et affiche ses rues faites et pas faites | 💡 Idée |
| **Parcs** | Plus de 50 % des chemins d'un parc parcourus : le parc entier est validé, avec une couleur dédiée | 💡 Idée |
| **Dernière marche, marche la plus longue** | Mises en valeur (rose ?) | 💡 Idée |
| **Gestion des marches** | Tableau des marches (date, durée, distance), avec suppression définitive des faux départs | 💡 Idée |
| **Carte hors ligne** | Fond PMTiles de Toulouse embarqué | ⏳ Phase 3 |
| **Stats** | % de Toulouse parcouru, km, quartiers, couleurs selon l'ancienneté | ⏳ Phase 4 |

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
