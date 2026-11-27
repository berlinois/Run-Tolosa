import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson';
import type { CoverageContext } from './coverage.store';
import { coveredParts, type StreetStatus } from './matcher';

/** Une rue sélectionnée : tous les tronçons voisins portant le même nom. */
export interface StreetSelection {
  name: string;
  district: string;
  status: StreetStatus | null;
  segmentIds: string[];
  lengthM: number;
  /** Mètres de la rue parcourus lors de la meilleure marche (c'est ce qui donne le statut). */
  bestM: number;
  /** Tronçons touchés par la meilleure marche, sur le total. */
  segmentsDone: number;
  passages: number;
  lastAt: number | null;
  /** Halo : la rue entière, en traits continus. */
  halo: Feature<MultiLineString>;
  /** Morceaux parcourus lors de la meilleure marche, colorés selon le statut de la rue. */
  parts: FeatureCollection<LineString>;
}

type Line = [number, number][];

/** Recolle des lignes qui se touchent par leurs extrémités en traits continus (halo sans raccords). */
export function mergeLines(lines: readonly Line[]): Line[] {
  const k = (p: [number, number]) => `${p[0]},${p[1]}`;
  const pool = lines.map((l) => [...l]);
  const out: Line[] = [];
  while (pool.length) {
    let cur = pool.shift()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        const [cs, ce, ls, le] = [k(cur[0]), k(cur[cur.length - 1]), k(l[0]), k(l[l.length - 1])];
        if (ce === ls) cur = [...cur, ...l.slice(1)];
        else if (ce === le) cur = [...cur, ...[...l].reverse().slice(1)];
        else if (cs === le) cur = [...l, ...cur.slice(1)];
        else if (cs === ls) cur = [...[...l].reverse(), ...cur.slice(1)];
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

export function selectStreet(segmentId: string, ctx: CoverageContext): StreetSelection | null {
  const street = ctx.index.streetOf.get(segmentId);
  const first = ctx.streets.byId.get(segmentId);
  if (street === undefined || !first) return null;
  const info = ctx.index.streets[street];
  const cov = ctx.byStreet.get(street);
  const segs = info.segmentIds.map((id) => ctx.streets.byId.get(id)!).filter(Boolean);

  const parts: Feature<LineString>[] = [];
  let segmentsDone = 0;
  for (const s of segs) {
    const entry = cov ? ctx.raw.segments[s.id]?.[cov.bestWalkId] : undefined;
    if (!entry) continue;
    segmentsDone++;
    for (const line of coveredParts(s.coords, entry[1])) {
      if (line.length > 1) parts.push({ type: 'Feature', properties: { status: cov!.status }, geometry: { type: 'LineString', coordinates: line } });
    }
  }
  return {
    name: first.name || 'Voie sans nom',
    district: first.district,
    status: cov?.status ?? null,
    segmentIds: info.segmentIds,
    lengthM: info.lengthM,
    bestM: Math.max(0, cov?.bestM ?? 0),
    segmentsDone,
    passages: cov?.passages ?? 0,
    lastAt: cov?.lastAt ?? null,
    halo: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: mergeLines(segs.map((s) => s.coords)) } },
    parts: { type: 'FeatureCollection', features: parts },
  };
}
