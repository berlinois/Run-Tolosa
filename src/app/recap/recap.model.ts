/** Récapitulatif d'une marche, figé une fois calculé (recaps.json). */
export interface WalkRecap {
  walkId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  distanceM: number;
  /** Rues passées de rien → rose, rien → doré, rose → doré. */
  noneToPink: number;
  noneToGold: number;
  pinkToGold: number;
  /** Petits quartiers traversés, et ceux où tu n'étais jamais passé. */
  quartiers: string[];
  newQuartiers: string[];
  /** Part de Toulouse parcourue avant / après la marche (0 à 1). */
  toulouseBefore: number;
  toulouseAfter: number;
  /** Trace simplifiée [lon, lat][] pour le dessin du bandeau et le recadrage. */
  trace: [number, number][];
  record: FunFact | null;
  fun: FunFact;
  /** Déjà affiché à l'écran. */
  shown: boolean;
}

export type FunFamily = 'equivalence' | 'defi' | 'record' | 'cumul' | 'rues';

export interface FunFact {
  id: string;
  family: FunFamily;
  icon: string;
  text: string;
}
