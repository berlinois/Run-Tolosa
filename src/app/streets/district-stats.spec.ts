import type { CoverageContext } from './coverage.store';
import { districtStats } from './district-stats';
import { computeStreetCoverage, type RawCoverage } from './street-coverage';
import { buildStreetIndex } from './street-index';
import type { StreetSegment, Streets } from './streets';

const seg = (id: string, name: string, a: [number, number], b: [number, number], lengthM: number): StreetSegment => ({
  id, name, highway: 'residential', district: 'Q', lengthM, coords: [a, b], bbox: [0, 0, 1, 1],
});
// Rue A (2 tronçons), Rue B, Rue C, un chemin sans nom.
const segs = [
  seg('a1', 'Rue A', [0, 0], [1, 0], 100), seg('a2', 'Rue A', [1, 0], [2, 0], 100),
  seg('b1', 'Rue B', [5, 5], [6, 5], 200), seg('c1', 'Rue C', [8, 8], [9, 8], 50), seg('x', '', [7, 7], [7, 8], 50),
];
const streets: Streets = { version: 't', segments: segs, byId: new Map(segs.map((s) => [s.id, s])) };

describe('districtStats', () => {
  it('compte rues, mètres et tronçons selon le statut de leur rue', () => {
    const index = buildStreetIndex(streets);
    const raw: RawCoverage = {
      walkDates: { w1: 10, w2: 30 },
      segments: { a1: { w1: [1, '1'] }, a2: { w1: [0.95, '1'] }, b1: { w2: [0.5, '1'] } },
    };
    const ctx: CoverageContext = { streets, index, raw, byStreet: computeStreetCoverage(raw, index, streets) };
    const s = districtStats('Guilheméry', 'small', segs.map((x) => x.id), ctx);
    expect(s.totalM).toBe(500);
    expect(s.goldM).toBe(200); // Rue A dorée (195 m sur 200 en une marche)
    expect(s.doneM).toBe(100 + 95 + 100);
    expect([s.streets, s.goldStreets, s.pinkStreets]).toEqual([3, 1, 1]);
    expect(s.segments).toEqual({ gold: 2, pink: 1, none: 2 });
    expect(s.walks).toBe(2);
    expect(s.lastAt).toBe(30);
  });
});
