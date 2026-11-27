import type { Walk } from '../tracking/model';
import type { RawCoverage } from '../streets/street-coverage';
import { buildStreetIndex } from '../streets/street-index';
import type { StreetSegment, Streets } from '../streets/streets';
import { buildRecap } from './recap-builder';

const seg = (id: string, name: string, a: [number, number], b: [number, number], lengthM: number): StreetSegment => ({
  id, name, highway: 'residential', district: 'Q', lengthM, coords: [a, b], bbox: [0, 0, 1, 1],
});
// Rue A (déjà rose avant), Rue B (nouvelle, faite à moitié), Rue C (nouvelle, faite en entier).
const segs = [seg('a1', 'Rue A', [0, 0], [1, 0], 100), seg('b1', 'Rue B', [5, 5], [6, 5], 200), seg('c1', 'Rue C', [8, 8], [9, 8], 50)];
const streets: Streets = { version: 't', segments: segs, byId: new Map(segs.map((s) => [s.id, s])) };
const index = buildStreetIndex(streets);
const walk = (id: string, startedAt: number, distanceM: number): Walk =>
  ({ id, startedAt, endedAt: startedAt + 30 * 60_000, status: 'finished', distanceM, pointCount: 100, processedWith: null });

describe('buildRecap', () => {
  it('compte les passages rien → rose, rien → doré et rose → doré, et les quartiers', () => {
    const before: RawCoverage = { walkDates: { w0: 1 }, segments: { a1: { w0: [0.5, '1'] } } };
    const after: RawCoverage = {
      walkDates: { w0: 1, w1: 2 },
      segments: { a1: { w0: [0.5, '1'], w1: [1, '1'] }, b1: { w1: [0.5, '1'] }, c1: { w1: [1, '1'] } },
    };
    const w0 = walk('w0', 1, 1000), w1 = walk('w1', 100_000, 2500);
    const r = buildRecap({
      walk: w1, points: [{ t: 0, lat: 0, lon: 0, acc: 5 }, { t: 1, lat: 1, lon: 1, acc: 5 }], before, after, streets, index,
      quartierOf: new Map([['a1', 'Guilheméry'], ['b1', 'Bonhoure'], ['c1', 'Bonhoure']]),
      walks: [w0, w1], history: [],
    });
    expect([r.noneToPink, r.noneToGold, r.pinkToGold]).toEqual([1, 1, 1]);
    expect(r.quartiers).toEqual(['Bonhoure', 'Guilheméry']);
    expect(r.newQuartiers).toEqual(['Bonhoure']);
    expect(r.toulouseAfter).toBeGreaterThan(r.toulouseBefore);
    expect(r.record?.id).toBe('record-longest');
    expect(r.fun.text.length).toBeGreaterThan(5);
    expect(r.trace).toHaveLength(2);
  });
});
