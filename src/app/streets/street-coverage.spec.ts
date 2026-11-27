import { computeStreetCoverage, type RawCoverage } from './street-coverage';
import { buildStreetIndex } from './street-index';
import type { StreetSegment, Streets } from './streets';

const seg = (id: string, name: string, a: [number, number], b: [number, number], lengthM: number): StreetSegment => ({
  id, name, highway: 'residential', district: 'Q', lengthM, coords: [a, b],
  bbox: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
});

// Rue de la Blanchisserie : 3 tronçons alignés (50 + 6 + 50 m) ; homonyme éloignée ; chemin sans nom.
const b1 = seg('b1', 'Rue de la Blanchisserie', [0, 0], [0, 1], 50);
const b2 = seg('b2', 'Rue de la Blanchisserie', [0, 1], [0, 2], 6);
const b3 = seg('b3', 'Rue de la Blanchisserie', [0, 2], [0, 3], 50);
const far = seg('far', 'Rue de la Blanchisserie', [9, 9], [9, 10], 80);
const path1 = seg('p1', '', [5, 5], [5, 6], 30);
const path2 = seg('p2', '', [5, 6], [5, 7], 30);
const segs = [b1, b2, b3, far, path1, path2];
const streets: Streets = { version: 't', segments: segs, byId: new Map(segs.map((s) => [s.id, s])) };

describe('buildStreetIndex', () => {
  it('regroupe les tronçons voisins de même nom, pas les homonymes éloignés ni les chemins sans nom', () => {
    const idx = buildStreetIndex(streets);
    const of = (id: string) => idx.streetOf.get(id)!;
    expect(of('b1')).toBe(of('b2'));
    expect(of('b2')).toBe(of('b3'));
    expect(of('far')).not.toBe(of('b1'));
    expect(of('p1')).not.toBe(of('p2'));
    expect(idx.streets[of('b1')].lengthM).toBe(106);
  });
});

describe('computeStreetCoverage', () => {
  const idx = buildStreetIndex(streets);
  const street = idx.streetOf.get('b1')!;

  it("statut de la rue entière : 2 tronçons sur 3 faits = 53 % → rose (cas Blanchisserie)", () => {
    const raw: RawCoverage = {
      walkDates: { w1: 100 },
      segments: { b1: { w1: [1, '1'] }, b2: { w1: [1, '1'] } },
    };
    const cov = computeStreetCoverage(raw, idx, streets).get(street)!;
    expect(cov.bestM).toBe(56);
    expect(cov.status).toBe('pink');
    expect(cov.passages).toBe(1);
    expect(cov.lastAt).toBe(100);
  });

  it('pas de cumul : deux moitiés faites par deux marches restent roses', () => {
    const raw: RawCoverage = {
      walkDates: { w1: 1, w2: 2 },
      segments: { b1: { w1: [1, '1'] }, b2: { w2: [1, '1'] }, b3: { w2: [1, '1'] } },
    };
    expect(computeStreetCoverage(raw, idx, streets).get(street)!.status).toBe('pink');
  });

  it('toute la rue en une marche : doré', () => {
    const raw: RawCoverage = {
      walkDates: { w1: 1 },
      segments: { b1: { w1: [1, '1'] }, b2: { w1: [1, '1'] }, b3: { w1: [0.9, '1'] } },
    };
    expect(computeStreetCoverage(raw, idx, streets).get(street)!.status).toBe('gold');
  });
});
