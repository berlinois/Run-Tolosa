import { PINK_MIN_METERS, PINK_MIN_RATIO, statusFor, type StreetStatus } from './matcher';
import type { StreetIndex } from './street-index';
import type { Streets } from './streets';

/** Pour un tronçon : marche → [part parcourue (0 à 1), masque des mètres parcourus]. */
export type SegmentWalks = Record<string, [number, string]>;

/** Couverture brute (coverage.json), dérivée des traces. */
export interface RawCoverage {
  /** Date de chaque marche comptée (fin, ou début à défaut). */
  walkDates: Record<string, number>;
  segments: Record<string, SegmentWalks>;
}

/** Couverture d'une rue entière. */
export interface StreetCoverage {
  street: number;
  status: StreetStatus | null;
  lengthM: number;
  /** Meilleure marche sur cette rue, et mètres de la rue qu'elle a parcourus. */
  bestWalkId: string;
  bestM: number;
  /** Mètres de la rue parcourus par chaque marche. */
  perWalkM: Map<string, number>;
  /** Marches qui comptent comme un passage (≥ 30 % ou ≥ 300 m de la rue). */
  passages: number;
  lastAt: number | null;
}

/** Calcule la couverture de toutes les rues touchées par au moins une marche. */
export function computeStreetCoverage(raw: RawCoverage, index: StreetIndex, streets: Streets): Map<number, StreetCoverage> {
  const perStreet = new Map<number, Map<string, number>>();
  for (const [segId, walks] of Object.entries(raw.segments)) {
    const street = index.streetOf.get(segId);
    const seg = streets.byId.get(segId);
    if (street === undefined || !seg) continue;
    const m = perStreet.get(street) ?? perStreet.set(street, new Map()).get(street)!;
    for (const [walkId, [ratio]] of Object.entries(walks)) m.set(walkId, (m.get(walkId) ?? 0) + ratio * seg.lengthM);
  }
  const out = new Map<number, StreetCoverage>();
  for (const [street, perWalkM] of perStreet) {
    const lengthM = index.streets[street].lengthM;
    let bestWalkId = '', bestM = -1, passages = 0, lastAt: number | null = null;
    for (const [walkId, m] of perWalkM) {
      if (m > bestM) { bestM = m; bestWalkId = walkId; }
      if (m / lengthM >= PINK_MIN_RATIO || m >= PINK_MIN_METERS) {
        passages++;
        lastAt = Math.max(lastAt ?? 0, raw.walkDates[walkId] ?? 0);
      }
    }
    out.set(street, { street, status: statusFor(bestM, lengthM), lengthM, bestWalkId, bestM, perWalkM, passages, lastAt });
  }
  return out;
}
