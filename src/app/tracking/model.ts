/** Objets persistés : voir docs/ARCHITECTURE.md, section « Modèle de données ». */

/** Un point GPS brut, tel qu'écrit par TrackingService.java (jamais modifié). */
export interface TrackPoint {
  /** Horodatage (ms epoch). */
  t: number;
  lat: number;
  lon: number;
  /** Précision horizontale en mètres. */
  acc: number;
  alt?: number;
  /** Vitesse en m/s. */
  spd?: number;
}

export type WalkStatus = 'recording' | 'finished' | 'processed';

/** Une marche (métadonnées, walks/<id>.json). */
export interface Walk {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: WalkStatus;
  distanceM: number;
  pointCount: number;
  /** Version de l'algo et des données OSM ayant calculé la couverture (Phase 2). */
  processedWith: string | null;
  /** Clôturée sans « Arrêter » (téléphone éteint, appli tuée…). */
  interrupted?: boolean;
}

export interface TrackingStatus {
  recording: boolean;
  walk: Walk | null;
}
