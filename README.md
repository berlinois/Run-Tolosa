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

## Installer l'appli sur le téléphone

1. Sur le téléphone, ouvrir la dernière Release :
   `https://github.com/berlinois/run-tolosa/releases/latest`
2. Télécharger `run-tolosa.apk`.
3. Android demande d'autoriser l'installation depuis le navigateur : accepter,
   une seule fois.
4. Pour une mise à jour, refaire la même chose. L'APK est toujours signé avec la
   même clé, donc il s'installe par-dessus sans perdre les données.

> Le repo est privé ? Le lien marche si le navigateur du téléphone est connecté
> à GitHub. Sinon, l'APK est aussi dans les artefacts de chaque run Actions.

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
