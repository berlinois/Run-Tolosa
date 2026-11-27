import type { SegmentCoverage } from './coverage.store';
import type { Streets } from './streets';

export type DistrictKind = 'small' | 'big';

/** Stats d'un quartier (petit ou grand), à partir de ses tronçons. */
export interface DistrictStats {
  name: string;
  kind: DistrictKind;
  totalM: number;
  /** Mètres validés (tronçons dorés). */
  goldM: number;
  /** Mètres parcourus : somme de la meilleure couverture de chaque tronçon. */
  doneM: number;
  /** Rues (noms distincts) : total, entièrement dorées, parcourues mais pas toutes dorées. */
  streets: number;
  goldStreets: number;
  pinkStreets: number;
  segments: { gold: number; pink: number; none: number };
  /** Marches différentes passées dans le quartier. */
  walks: number;
  lastAt: number | null;
}

export function districtStats(
  name: string,
  kind: DistrictKind,
  segmentIds: readonly string[],
  streets: Streets,
  coverage: Record<string, SegmentCoverage>,
): DistrictStats {
  const stats: DistrictStats = {
    name, kind, totalM: 0, goldM: 0, doneM: 0, streets: 0, goldStreets: 0, pinkStreets: 0,
    segments: { gold: 0, pink: 0, none: 0 }, walks: 0, lastAt: null,
  };
  const byStreet = new Map<string, { gold: number; touched: number; count: number }>();
  const walks = new Set<string>();
  for (const id of segmentIds) {
    const s = streets.byId.get(id);
    if (!s) continue;
    const c = coverage[id];
    stats.totalM += s.lengthM;
    if (c) {
      stats.doneM += c.best * s.lengthM;
      if (c.status === 'gold') { stats.goldM += s.lengthM; stats.segments.gold++; } else stats.segments.pink++;
      stats.lastAt = Math.max(stats.lastAt ?? 0, c.lastAt);
      for (const w of Object.keys(c.walks ?? {})) walks.add(w);
    } else {
      stats.segments.none++;
    }
    if (s.name) {
      const st = byStreet.get(s.name) ?? { gold: 0, touched: 0, count: 0 };
      st.count++;
      if (c) st.touched++;
      if (c?.status === 'gold') st.gold++;
      byStreet.set(s.name, st);
    }
  }
  stats.streets = byStreet.size;
  for (const st of byStreet.values()) {
    if (st.gold === st.count) stats.goldStreets++;
    else if (st.touched > 0) stats.pinkStreets++;
  }
  stats.walks = walks.size;
  return stats;
}
