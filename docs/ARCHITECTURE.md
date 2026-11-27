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
| `steps` | `4812` | Pas de la marche (podomètre matériel), si disponible |
| `ascentM`, `descentM` | `23.4`, `18.9` | Dénivelé positif et négatif (baromètre, lissé, seuil anti-bruit de 1,5 m) |
| `sensors` | `{ "steps": true, "pressure": true }` | Capteurs disponibles pendant la marche |

**`TrackPoint`** : un point GPS brut, dans `walks/<id>.jsonl`, une ligne JSON par
point. Il est écrit et flushé dès réception, puis jamais modifié.

| Champ | Exemple | Rôle |
|---|---|---|
| `t` | `1795849925000` | Horodatage (ms) |
| `lat`, `lon` | `43.6045`, `1.4442` | Position (7 décimales) |
| `acc` | `8` | Précision (m). Au-delà de 25 m, le point est ignoré pour la distance, l'affichage et l'association aux rues |
| `alt`, `spd` | `146.2`, `1.38` | Altitude GPS (m) et vitesse (m/s), si disponibles |
| `steps` | `1250` | Cumul de pas depuis le début de la marche (podomètre), si disponible |
| `hPa` | `1004.37` | Pression atmosphérique brute (baromètre), si disponible : l'altitude et le dénivelé pourront être recalculés plus finement |

Les pas et la pression sont enregistrés **dès maintenant**, en vue de futures
features de dépense énergétique : calories, effort, optimisation du dénivelé
d'un parcours. Le podomètre demande la permission « activité physique »
(facultative) ; le baromètre n'en demande aucune.

**`coverage.json`** : la couverture **brute**, **dérivée** des traces et
recalculable à tout moment. Il contient :
- `processedWith` : la version de l'algo et des rues ;
- `walkIds` : les marches déjà comptées ;
- `walkDates` : la date de chaque marche ;
- `segments` : `{ idTronçon: { idMarche: [part parcourue, masque] } }`. Le
  masque note les mètres parcourus, un caractère tous les ~4 m.

Le statut et les stats de chaque rue et de chaque quartier sont **calculés à
la volée** à partir de ce fichier. Si l'algo ou les rues changent, ou si une
marche est supprimée, tout est recalculé depuis les traces.

### Sur le disque

```
files/
  walks/<id>.json     Walk
  walks/<id>.jsonl    TrackPoints (bruts, immuables)
  coverage.json       couverture brute par tronçon et par marche (voir ci-dessus)
  recaps.json         récaps de fin de marche, figés, et historique des stats rigolotes
```

Une heure de marche fait environ 1 800 points, soit environ 100 Ko. Une marche
par jour pendant un an fait environ 35 Mo. Pour sauvegarder, il suffit de zipper
le dossier.

## L'association des points GPS aux rues

Le code est dans `src/app/streets/matcher.ts`, avec ses tests. Les seuils ont été
réglés sur une vraie marche : un point par seconde, précision médiane de 4,5 m.

1. **Le référentiel** : `scripts/extract-streets.mjs` interroge Overpass sur la
   commune de Toulouse (INSEE 31555).
   - **Gardé** : rues, avenues, voies piétonnes, chemins, pistes cyclables,
     escaliers et chemins de halage (bords de Garonne, canal du Midi).
   - **Exclu** : autoroutes, voies rapides, accès de parking et voies de
     service, accès privés, trottoirs et passages piétons.
   - Chaque voie est coupée aux intersections, et le résultat va dans
     `public/streets/toulouse.json`.
   - Chaque tronçon est rattaché à l'un des **20 quartiers officiels**
     (OSM `admin_level=10`), pour les futures stats par quartier.
   - Volume : environ 37 800 tronçons, 1 940 km, 4,2 Mo.
   - Les petits quartiers sont construits à partir des IRIS par
     `scripts/build-neighbourhoods.mjs`, qui produit aussi
     `petits-quartiers-troncons.json` : les tronçons de chaque petit
     quartier, rattachés par le milieu du tronçon.
   - L'extraction tourne dans GitHub Actions (workflow « Extraction des rues
     OSM », lancé à la main), qui commite le fichier.
2. **Les points de la trace** : on garde les points dont la précision est
   inférieure ou égale à 25 m, et on comble les trous de moins de 40 m (un point
   tous les 3 m).
3. **La couverture d'un tronçon** : on l'échantillonne tous les 4 m. Un
   échantillon est couvert si un point de la trace se trouve à moins de **12 m**
   sur le côté et à moins de **5 m** dans le sens de la rue. Grâce à cette
   tolérance de 5 m, une rue simplement croisée, ou faite à moitié, n'est pas
   « étirée » par le rayon.
4. **La rue** : les tronçons voisins de même nom forment une rue
   (`street-index.ts`). Deux rues homonymes non reliées restent distinctes,
   et un chemin sans nom est sa propre rue.
5. **Le statut**, calculé sur **la rue entière et la meilleure marche**, sans
   cumul entre marches (`street-coverage.ts`) :
   - **doré** (rue validée) : sur une même marche, la partie non parcourue de
     la rue fait au plus **10 m + 3 % de sa longueur**, avec au moins 50 %
     parcourus ;
   - **rose** (rue parcourue) : au moins **30 %** de la rue, **ou au moins
     300 m**, sur une marche. Le plancher de 300 m sert aux longues avenues ;
   - sinon, pas de statut.

   Tous les tronçons d'une rue prennent sa couleur. Un passage, c'est une
   marche qui atteint ce seuil du rose sur la rue.

Si on change un seuil, on change `MATCHER_ID` : tout est alors recalculé
automatiquement à partir des traces brutes.

## Structure du code

```
src/app/
  core/
    location.service.ts    position ponctuelle                   ✅ Phase 0
  streets/
    streets.ts             format du référentiel des tronçons    ✅ Phase 2
    matcher.ts             points GPS → tronçons validés         ✅ Phase 2
    coverage.store.ts      coverage.json, rues dorées, stats     ✅ Phase 2
    street-index.ts        tronçons → rues (même nom, reliés)    ✅
    street-coverage.ts     statut et stats par rue               ✅
    street-selection.ts    rue entière, stats, parties faites    ✅
    street-card.ts         carte « détail d'une rue »            ✅
    district-stats.ts      stats d'un quartier                   ✅
    district-card.ts       carte « stats d'un quartier »         ✅
  map/map.ts               carte MapLibre + calques de l'appli   ✅
  map/basemaps.ts          fonds : OpenFreeMap + IGN (WMTS)      ✅
  tracking/
    model.ts               Walk, TrackPoint                      ✅ Phase 1
    tracking.plugin.ts     pont vers le plugin Java              ✅ Phase 1
    tracking.store.ts      état des marches (signals)            ✅ Phase 1
    track-geo.ts           traces → GeoJSON, formats             ✅ Phase 1
    walk-controls.ts       Démarrer / Arrêter, chrono            ✅ Phase 1
  recap/
    recap-builder.ts       récap : rues avant / après la marche  ✅
    fun-facts.ts           catalogue des stats rigolotes, records ✅
    recap.store.ts         recaps.json                           ✅
    recap-card.ts          carte récap « trophée »               ✅
  export/
    export-button.ts       bouton ⤓ + popup d'extraction         ✅ Phase 1
android/app/src/main/java/fr/runtolosa/app/
  export/ExportPlugin.java zip → Téléchargements ou sélecteur    ✅ Phase 1
android/app/src/main/java/fr/runtolosa/app/tracking/
  TrackingPlugin.java      API exposée à Angular                 ✅ Phase 1
  TrackingService.java     foreground service GPS                ✅ Phase 1
  WalkStore.java           fichiers walks/*.json(l)              ✅ Phase 1
scripts/
  extract-streets.mjs      OSM (Overpass) → tronçons             ✅ Phase 2
  generate-icons.mjs       design/icon.svg → icônes Android      ✅
  build-splash.mjs         données → écran d'accueil (splash.svg) ✅
  extract-water.mjs        Garonne et canaux (OSM) → eau.geojson  ✅
```

## Feuille de route

| Phase | Contenu | « C'est fini quand… » |
|---|---|---|
| **0. Pipeline** ✅ | Squelette Angular + Capacitor + MapLibre, 3 rues de démo coloriées, bouton « me localiser », CI qui produit l'APK et la Release | L'APK de la Release s'installe sur le téléphone, la carte s'affiche, le point GPS apparaît |
| **1. Enregistrer** ✅ | Plugin Java : démarrer/arrêter une marche, foreground service, écriture `.jsonl`, liste des marches, tracé brut sur la carte | Une marche de 30 min poche, écran éteint, donne une trace complète sans trou |
| **2. Rues** 🧪 | Script d'extraction OSM, association des points aux rues, `coverage.json`, coloriage réel | Les rues réellement parcourues sont vertes, les autres grises |
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
