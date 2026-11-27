import type { CoverageContext } from './coverage.store';
import { computeStreetCoverage, type RawCoverage } from './street-coverage';
import { buildStreetIndex } from './street-index';
import { mergeLines, selectStreet } from './street-selection';
import type { StreetSegment, Streets } from './streets';

const seg = (id: string, name: string, a: [number, number], b: [number, number], lengthM = 100): StreetSegment => ({
  id, name, highway: 'residential', district: 'Q', lengthM, coords: [a, b],
  bbox: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
});
const a1 = seg('a1', 'Rue A', [0, 0], [1, 0]);
const a2 = seg('a2', 'Rue A', [2, 0], [1, 0]); // tracé dans l'autre sens
const a3 = seg('a3', 'Rue A', [2, 0], [3, 0]);
const segs = [a1, a2, a3];
const streets: Streets = { version: 't', segments: segs, byId: new Map(segs.map((s) => [s.id, s])) };

describe('street-selection', () => {
  it('recolle les tronçons en un seul trait continu (halo sans raccords)', () => {
    const merged = mergeLines(segs.map((s) => s.coords));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it('sélectionne la rue entière avec ses stats et les morceaux de la meilleure marche', () => {
    const index = buildStreetIndex(streets);
    const raw: RawCoverage = { walkDates: { w1: 10 }, segments: { a1: { w1: [1, '1'.repeat(25)] }, a2: { w1: [0.5, '1'.repeat(12) + '0'.repeat(13)] } } };
    const ctx: CoverageContext = { streets, index, raw, byStreet: computeStreetCoverage(raw, index, streets) };
    const sel = selectStreet('a3', ctx)!;
    expect(sel.name).toBe('Rue A');
    expect(sel.lengthM).toBe(300);
    expect(sel.bestM).toBe(150);
    expect(sel.status).toBe('pink');
    expect(sel.segmentsDone).toBe(2);
    expect(sel.passages).toBe(1);
    expect(sel.halo.geometry.coordinates).toHaveLength(1);
    expect(sel.parts.features.length).toBe(2);
  });
});
