import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson';
import type { SegmentCoverage } from './coverage.store';
import { coveredParts, type StreetStatus } from './matcher';
import type { StreetSegment, Streets } from './streets';

/** Une rue sélectionnée : tous les tronçons voisins portant le même nom. */
export interface StreetSelection {
  name: string;
  district: string;
  segmentIds: string[];
  lengthM: number;
  /** Mètres parcourus : somme, tronçon par tronçon, de leur meilleure marche. */
  doneM: number;
  gold: number;
  pink: number;
  none: number;
  /** Meilleure part de la rue faite en UNE marche (0 à 1). */
  bestWalkRatio: number;
  passages: number;
  lastAt: number | null;
  /** Halo : la rue entière. */
  halo: Feature<MultiLineString>;
  /** Morceaux réellement parcourus, colorés selon le statut de leur tronçon. */
  parts: FeatureCollection<LineString>;
}

const key = (p: readonly [number, number]) => `${p[0]},${p[1]}`;

/**
 * Tronçons de la rue : ceux de même nom reliés au tronçon touché par leurs
 * extrémités (deux rues homonymes éloignées ne sont pas mélangées). Un tronçon
 * sans nom (chemin…) est sélectionné seul.
 */
export function connectedSameName(start: StreetSegment, byName: Map<string, StreetSegment[]>): StreetSegment[] {
  if (!start.name) return [start];
  const candidates = byName.get(start.name) ?? [start];
  const ends = (s: StreetSegment) => [key(s.coords[0]), key(s.coords[s.coords.length - 1])];
  const picked = new Set([start.id]);
  const frontier = new Set(ends(start));
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of candidates) {
      if (picked.has(s.id)) continue;
      const [a, b] = ends(s);
      if (frontier.has(a) || frontier.has(b)) {
        picked.add(s.id);
        frontier.add(a);
        frontier.add(b);
        grew = true;
      }
    }
  }
  return candidates.filter((s) => picked.has(s.id));
}

export function selectStreet(
  startId: string,
  streets: Streets,
  byName: Map<string, StreetSegment[]>,
  coverage: Record<string, SegmentCoverage>,
): StreetSelection | null {
  const start = streets.byId.get(startId);
  if (!start) return null;
  const segs = connectedSameName(start, byName);
  const lengthM = segs.reduce((sum, s) => sum + s.lengthM, 0);

  let doneM = 0, gold = 0, pink = 0, none = 0;
  let lastAt: number | null = null;
  const perWalk = new Map<string, number>(); // marche → mètres parcourus sur la rue
  const parts: Feature<LineString>[] = [];
  for (const s of segs) {
    const c = coverage[s.id];
    if (!c) { none++; continue; }
    if (c.status === 'gold') gold++; else pink++;
    doneM += c.best * s.lengthM;
    lastAt = Math.max(lastAt ?? 0, c.lastAt);
    for (const [walkId, ratio] of Object.entries(c.walks ?? {})) {
      perWalk.set(walkId, (perWalk.get(walkId) ?? 0) + ratio * s.lengthM);
    }
    const status: StreetStatus = c.status;
    for (const line of coveredParts(s.coords, c.mask ?? '')) {
      if (line.length > 1) parts.push({ type: 'Feature', properties: { status }, geometry: { type: 'LineString', coordinates: line } });
    }
  }
  const bestWalkM = Math.max(0, ...perWalk.values());
  return {
    name: start.name || 'Voie sans nom',
    district: start.district,
    segmentIds: segs.map((s) => s.id),
    lengthM,
    doneM,
    gold,
    pink,
    none,
    bestWalkRatio: lengthM > 0 ? Math.min(1, bestWalkM / lengthM) : 0,
    passages: perWalk.size,
    lastAt,
    halo: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: segs.map((s) => s.coords) } },
    parts: { type: 'FeatureCollection', features: parts },
  };
}

/** Index nom de rue → tronçons. */
export function indexByName(streets: Streets): Map<string, StreetSegment[]> {
  const byName = new Map<string, StreetSegment[]>();
  for (const s of streets.segments) {
    if (!s.name) continue;
    (byName.get(s.name) ?? byName.set(s.name, []).get(s.name)!).push(s);
  }
  return byName;
}
