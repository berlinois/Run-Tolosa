# Architecture de Run Tolosa

## Vue d'ensemble

```
┌──────────────────────────── Téléphone Android ────────────────────────────┐
│                                                                            │
│  ┌─ Natif (Java) ───────────────────┐     ┌─ WebView (Angular) ─────────┐  │
│  │ TrackingPlugin                   │     │                             │  │
│  │  └ TrackingService               │     │ TrackImportService          │  │
│  │    (foreground service, notif)   │     │   lit les traces terminées  │  │
│  │    GPS fused toutes les 2 s      │     │            │                │  │
│  │            │                     │     │            ▼                │  │
│  │            ▼                     │     │ MatchingService             │  │
│  │  tracks/2026-11-27_0712.jsonl ───┼────▶│   point GPS → tronçon       │  │
│  │  (1 ligne JSON par point)        │     │   (index spatial rbush)     │  │
│  └──────────────────────────────────┘     │            │                │  │
│                                           │            ▼                │  │
│  Assets embarqués (lecture seule)         │ CoverageStore               │  │
│   streets/toulouse.geojson ──────────────▶│   coverage.json             │  │
│   tiles/toulouse.pmtiles ──┐              │   {segmentId: passages,…}   │  │
│                            │              │            │                │  │
│                            └─────────────▶│ MapView (MapLibre GL JS)    │  │
│                                           │   fond PMTiles + calque     │  │
│                                           │   rues colorié              │  │
│                                           └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

**Principe clé : le natif enregistre, le web calcule.**
- La partie Java fait le strict minimum : elle écrit des points GPS dans un
  fichier, en continu, même écran éteint. Elle ne dépend pas de la WebView, donc
  aucun point n'est perdu si Android met l'interface en pause.
- Tout le reste (association aux rues, couverture, affichage) est en TypeScript.
  Ça se teste facilement et se développe dans le navigateur.

## Modèle de données

**Principe : les traces GPS brutes sont la seule vérité.** Elles ne sont jamais
modifiées ni supprimées. Tout le reste (couverture, stats) est un calcul dérivé,
qu'on peut refaire à tout moment : nouvel algo, données OSM plus récentes,
nouvelles features.

### Référentiel, en lecture seule, embarqué dans l'appli

**`StreetSegment`** : un tronçon de rue, d'une intersection à la suivante.
Toulouse en compte environ 30 000 à 50 000, dans `streets/toulouse.geojson`.

| Champ | Exemple | Rôle |
|---|---|---|
| `id` | `"w12345:3"` | Stable : rue OSM et numéro du tronçon |
| `osmWayId` | `12345` | Lien vers OpenStreetMap |
| `name` | `"Rue du Taur"` | Affichage, regroupement par rue |
| `highway` | `"residential"` | Type de voie (filtres) |
| `district` | `"Capitole"` | Quartier (stats) |
| `lengthM` | `84.2` | km et % parcourus |
| `geometry` | LineString | Tracé |

### Données de l'utilisateur, sur le téléphone

**`Walk`** : une marche, dans `walks/<id>.json`.

| Champ | Exemple | Rôle |
|---|---|---|
| `id` | `"2026-11-27T07-12-05"` | Date et heure locales du départ |
| `startedAt` / `endedAt` | ms epoch | Durée |
| `status` | `recording` → `finished` → `processed` | Cycle de vie |
| `distanceM` | `5240` | Distance, calculée sur les points dont la précision est ≤ 25 m |
| `pointCount` | `1730` | Contrôle qualité |
| `processedWith` | `"matcher-v1/osm-2026-11"` | Savoir quoi recalculer |
| `interrupted` | `true` | Optionnel : marche clôturée sans « Arrêter » |

**`TrackPoint`** : un point GPS brut, dans `walks/<id>.jsonl`, une ligne JSON par
point. Il est écrit et flushé dès réception, puis jamais modifié.

| Champ | Exemple | Rôle |
|---|---|---|
| `t` | `1795849925000` | Horodatage (ms) |
| `lat`, `lon` | `43.6045`, `1.4442` | Position (7 décimales) |
| `acc` | `8` | Précision (m). Au-delà de 25 m, le point est ignoré pour la distance, l'affichage et l'association aux rues |
| `alt`, `spd` | `146.2`, `1.38` | Altitude (m) et vitesse (m/s), si disponibles |

**`SegmentCoverage`** : la couverture, dans `coverage.json` (Phase 2). Ce fichier
est **dérivé** des traces.

| Champ | Exemple | Rôle |
|---|---|---|
| `segmentId` | `"w12345:3"` | Lien vers le tronçon |
| `passages` | `4` | Nombre de marches où le tronçon est validé : c'est la couleur |
| `firstAt` / `lastAt` | ms epoch | Couleur selon l'ancienneté, date de découverte |
| `lastWalkId` | `"2026-11-27T07-12-05"` | Dernière marche |

Un tronçon sans entrée n'a jamais été parcouru. Un tronçon est **validé** pour
une marche si au moins 60 % de sa longueur est couverte.

### Sur le disque

```
files/
  walks/<id>.json     Walk
  walks/<id>.jsonl    TrackPoints (bruts, immuables)
  coverage.json       { segmentId: SegmentCoverage }   (Phase 2)
  meta.json           version du schéma, version OSM, seuils (Phase 2)
```

Une heure de marche fait environ 1 800 points, soit environ 100 Ko. Une marche
par jour pendant un an fait environ 35 Mo. Pour sauvegarder, il suffit de zipper
le dossier.

## L'association des points GPS aux rues

C'est la partie la plus délicate, en Phase 2.
1. Au démarrage : on charge les tronçons dans un index spatial (`rbush`).
2. Pour chaque point GPS dont la précision est inférieure à 25 m : on cherche les
   tronçons à moins d'environ 15 m (`turf` pour la distance point-ligne).
3. Un tronçon est **validé pour une marche** si au moins 60 % de sa longueur a
   été couverte par des points proches. Ça évite de compter une rue que tu as
   seulement croisée.
4. On ajoute 1 à `passages` pour chaque tronçon validé, une fois par marche.

Les seuils sont des paramètres à ajuster sur tes vraies traces.

## Structure du code

```
src/app/
  core/
    coverage-style.ts      palette et expression MapLibre        ✅ Phase 0
    demo-streets.ts        3 rues de démo                        ✅ Phase 0 (supprimé en Phase 2)
    location.service.ts    position ponctuelle                   ✅ Phase 0
    streets.repository.ts  chargement du GeoJSON + index         ⏳ Phase 2
    matching.service.ts    points → tronçons                     ⏳ Phase 2
    coverage.store.ts      lecture/écriture coverage.json        ⏳ Phase 2
  map/map.ts               carte MapLibre + calques              ✅ Phase 0-1
  tracking/
    model.ts               Walk, TrackPoint                      ✅ Phase 1
    tracking.plugin.ts     pont vers le plugin Java              ✅ Phase 1
    tracking.store.ts      état des marches (signals)            ✅ Phase 1
    track-geo.ts           traces → GeoJSON, formats             ✅ Phase 1
    walk-controls.ts       Démarrer / Arrêter, chrono            ✅ Phase 1
android/app/src/main/java/fr/runtolosa/app/tracking/
  TrackingPlugin.java      API exposée à Angular                 ✅ Phase 1
  TrackingService.java     foreground service GPS                ✅ Phase 1
  WalkStore.java           fichiers walks/*.json(l)              ✅ Phase 1
scripts/
  extract-streets.mjs      OSM (Overpass) → tronçons GeoJSON     ⏳ Phase 2
```

## Feuille de route

| Phase | Contenu | « C'est fini quand… » |
|---|---|---|
| **0. Pipeline** ✅ | Squelette Angular + Capacitor + MapLibre, 3 rues de démo coloriées, bouton « me localiser », CI qui produit l'APK et la Release | L'APK de la Release s'installe sur le téléphone, la carte s'affiche, le point GPS apparaît |
| **1. Enregistrer** 🧪 | Plugin Java : démarrer/arrêter une marche, foreground service, écriture `.jsonl`, liste des marches, tracé brut sur la carte | Une marche de 30 min poche, écran éteint, donne une trace complète sans trou |
| **2. Rues** | Script d'extraction OSM, association des points aux rues, `coverage.json`, coloriage réel | Les rues réellement parcourues sont vertes, les autres grises |
| **3. Hors ligne** | Fond de carte PMTiles embarqué | L'appli marche en mode avion |
| **4. Plaisir** | Stats (% de Toulouse, km), couleurs par ancienneté, filtres par quartier, export et sauvegarde | — |

## Points d'attention Android

- **Permissions de localisation** : il faut « Pendant l'utilisation de l'appli »
  plus la notification du foreground service. Avec un foreground service de type
  `location`, il n'y a pas besoin de la permission « Toujours autoriser ».
- **Économie de batterie** : certains constructeurs (Xiaomi, Samsung, Huawei…)
  tuent les services. Il faudra peut-être exclure l'appli de l'optimisation de
  batterie, dans les réglages du téléphone.
- **Signature** : `android/app/debug.keystore` est versionné volontairement.
  Tous les APK de la CI ont la même signature, donc les mises à jour s'installent
  par-dessus. C'est sans risque pour une appli perso hors Play Store.
