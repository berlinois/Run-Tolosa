import type { SegmentCoverage } from './coverage.store';
import { connectedSameName, indexByName, selectStreet } from './street-selection';
import type { StreetSegment, Streets } from './streets';

const seg = (id: string, name: string, a: [number, number], b: [number, number], lengthM = 100): StreetSegment => ({
  id, name, highway: 'residential', district: 'Q', lengthM, coords: [a, b],
  bbox: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
});
const cov = (status: 'gold' | 'pink', best: number, walks: Record<string, number>, lastAt = 1): SegmentCoverage => ({
  status, best, bestWalkId: Object.keys(walks)[0], mask: '1'.repeat(25), walks, passages: Object.keys(walks).length, firstAt: 1, lastAt, lastWalkId: 'w',
});

// Rue A en 3 tronçons alignés, une rue A homonyme ailleurs, une rue B qui croise.
const a1 = seg('a1', 'Rue A', [0, 0], [1, 0]);
const a2 = seg('a2', 'Rue A', [1, 0], [2, 0]);
const a3 = seg('a3', 'Rue A', [2, 0], [3, 0]);
const far = seg('far', 'Rue A', [50, 50], [51, 50]);
const b1 = seg('b1', 'Rue B', [1, -1], [1, 0]);
const streets: Streets = { version: 't', segments: [a1, a2, a3, far, b1], byId: new Map([a1, a2, a3, far, b1].map((s) => [s.id, s])) };
const byName = indexByName(streets);

describe('street-selection', () => {
  it('sélectionne les tronçons de même nom reliés, pas les homonymes éloignés', () => {
    expect(connectedSameName(a2, byName).map((s) => s.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('calcule les stats de la rue entière', () => {
    const coverage = {
      a1: cov('gold', 1, { w1: 1, w2: 0.5 }, 10),
      a2: cov('pink', 0.5, { w1: 0.5 }, 20),
    };
    const sel = selectStreet('a1', streets, byName, coverage)!;
    expect(sel.name).toBe('Rue A');
    expect(sel.lengthM).toBe(300);
    expect(sel.doneM).toBe(150);
    expect([sel.gold, sel.pink, sel.none]).toEqual([1, 1, 1]);
    expect(sel.passages).toBe(2);
    expect(sel.bestWalkRatio).toBeCloseTo(0.5); // w1 : 100 + 50 m sur 300 m
    expect(sel.lastAt).toBe(20);
    expect(sel.halo.geometry.coordinates).toHaveLength(3);
  });
});
