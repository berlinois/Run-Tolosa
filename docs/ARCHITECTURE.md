# Architecture de Run Tolosa

## Vue d'ensemble

```
┌──────────────────────────── Téléphone Android ────────────────────────────┐
│                                                                            │
│  ┌─ Natif (Java) ───────────────────┐     ┌─ WebView (Angular) ─────────┐  │
│  │ TrackingPlugin                   │     │                             │  │
│  │  └ TrackingService               │     │ TrackImportService          │  │
│  │    (foreground service, notif)   │     │   lit les traces terminées  │  │
│  │    GPS toutes les ~3 s / 5 m     │     │            │                │  │
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

## Les données

| Fichier | Où | Contenu | Écrit par |
|---|---|---|---|
| `streets/toulouse.geojson` | Assets de l'appli | Tronçons de rue OSM : `{id, name, highway}` + géométrie | Script de préparation, une seule fois |
| `tiles/toulouse.pmtiles` | Assets de l'appli | Fond de carte vectoriel hors ligne | Extrait Protomaps, une seule fois |
| `tracks/*.jsonl` | Stockage privé de l'appli | `{"t":…, "lat":…, "lon":…, "acc":…}` par ligne | TrackingService (Java) |
| `coverage.json` | Stockage privé de l'appli | `{segmentId: {passages, first, last}}` | CoverageStore (Angular) |

Les deux premiers fichiers sont figés. On les régénère seulement quand on veut
des rues plus récentes. Les deux derniers sont **tes données** : de simples
fichiers texte, faciles à exporter et à sauvegarder.

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
    tracking.service.ts    pont vers le plugin Java              ⏳ Phase 1
    streets.repository.ts  chargement du GeoJSON + index         ⏳ Phase 2
    matching.service.ts    points → tronçons                     ⏳ Phase 2
    coverage.store.ts      lecture/écriture coverage.json        ⏳ Phase 2
  map/map.ts               carte MapLibre + calques              ✅ Phase 0
android/app/src/main/java/fr/runtolosa/app/
  tracking/TrackingPlugin.java    API exposée à Angular          ⏳ Phase 1
  tracking/TrackingService.java   foreground service GPS         ⏳ Phase 1
scripts/
  extract-streets.mjs      OSM (Overpass) → tronçons GeoJSON     ⏳ Phase 2
```

## Feuille de route

| Phase | Contenu | « C'est fini quand… » |
|---|---|---|
| **0. Pipeline** ✅ | Squelette Angular + Capacitor + MapLibre, 3 rues de démo coloriées, bouton « me localiser », CI qui produit l'APK et la Release | L'APK de la Release s'installe sur le téléphone, la carte s'affiche, le point GPS apparaît |
| **1. Enregistrer** | Plugin Java : démarrer/arrêter une marche, foreground service, écriture `.jsonl`, liste des marches, tracé brut sur la carte | Une marche de 30 min poche, écran éteint, donne une trace complète sans trou |
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
