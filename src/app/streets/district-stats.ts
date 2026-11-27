import type { CoverageContext } from './coverage.store';

export type DistrictKind = 'small' | 'big';

/** Stats d'un quartier (petit ou grand), à partir de ses tronçons et du statut de leurs rues. */
export interface DistrictStats {
  name: string;
  kind: DistrictKind;
  totalM: number;
  /** Mètres des tronçons dont la rue est dorée. */
  goldM: number;
  /** Mètres parcourus (meilleure marche de chaque rue colorée). */
  doneM: number;
  /** Rues (dans le quartier) : total, dorées, roses. */
  streets: number;
  goldStreets: number;
  pinkStreets: number;
  segments: { gold: number; pink: number; none: number };
  /** Marches différentes passées dans le quartier. */
  walks: number;
  lastAt: number | null;
}

export function districtStats(name: string, kind: DistrictKind, segmentIds: readonly string[], ctx: CoverageContext): DistrictStats {
  const stats: DistrictStats = {
    name, kind, totalM: 0, goldM: 0, doneM: 0, streets: 0, goldStreets: 0, pinkStreets: 0,
    segments: { gold: 0, pink: 0, none: 0 }, walks: 0, lastAt: null,
  };
  const streetsSeen = new Set<number>();
  const walks = new Set<string>();
  for (const id of segmentIds) {
    const s = ctx.streets.byId.get(id);
    const street = ctx.index.streetOf.get(id);
    if (!s || street === undefined) continue;
    const cov = ctx.byStreet.get(street);
    const status = cov?.status ?? null;
    stats.totalM += s.lengthM;
    if (status && cov) {
      stats.doneM += (ctx.raw.segments[id]?.[cov.bestWalkId]?.[0] ?? 0) * s.lengthM;
      if (status === 'gold') { stats.goldM += s.lengthM; stats.segments.gold++; } else stats.segments.pink++;
      for (const w of Object.keys(ctx.raw.segments[id] ?? {})) walks.add(w);
      if (cov.lastAt) stats.lastAt = Math.max(stats.lastAt ?? 0, cov.lastAt);
    } else {
      stats.segments.none++;
    }
    if (s.name && !streetsSeen.has(street)) {
      streetsSeen.add(street);
      if (status === 'gold') stats.goldStreets++;
      else if (status === 'pink') stats.pinkStreets++;
    }
  }
  stats.streets = streetsSeen.size;
  stats.walks = walks.size;
  return stats;
}
