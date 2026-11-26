# Run Tolosa

Appli Android perso pour colorier, sur la carte de Toulouse, toutes les rues
dans lesquelles je suis passé en marchant. Tout reste sur le téléphone : pas
de serveur, pas de compte, pas d'abonnement. **Coût : 0 €.**

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
