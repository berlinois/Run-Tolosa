import type { Streets } from './streets';

/** Une rue = tronçons voisins (reliés par leurs extrémités) portant le même nom. */
export interface StreetInfo {
  name: string;
  segmentIds: string[];
  lengthM: number;
}

export interface StreetIndex {
  streets: StreetInfo[];
  /** Tronçon → indice de sa rue dans `streets`. */
  streetOf: Map<string, number>;
}

/**
 * Regroupe les tronçons en rues. Deux rues homonymes non reliées restent
 * distinctes ; un tronçon sans nom (chemin…) forme sa propre « rue ».
 */
export function buildStreetIndex(streets: Streets): StreetIndex {
  const segs = streets.segments;
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstAtEnd = new Map<string, number>(); // "nom|extrémité" → premier tronçon vu
  segs.forEach((s, i) => {
    if (!s.name) return;
    for (const p of [s.coords[0], s.coords[s.coords.length - 1]]) {
      const k = `${s.name}|${p[0]},${p[1]}`;
      const j = firstAtEnd.get(k);
      if (j === undefined) firstAtEnd.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const byRoot = new Map<number, number>();
  const out: StreetInfo[] = [];
  const streetOf = new Map<string, number>();
  segs.forEach((s, i) => {
    const root = find(i);
    let idx = byRoot.get(root);
    if (idx === undefined) {
      idx = out.length;
      byRoot.set(root, idx);
      out.push({ name: s.name, segmentIds: [], lengthM: 0 });
    }
    out[idx].segmentIds.push(s.id);
    out[idx].lengthM += s.lengthM;
    streetOf.set(s.id, idx);
  });
  return { streets: out, streetOf };
}
