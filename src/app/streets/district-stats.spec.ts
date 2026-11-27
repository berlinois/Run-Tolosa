import type { SegmentCoverage } from './coverage.store';
import { districtStats } from './district-stats';
import type { StreetSegment, Streets } from './streets';

const seg = (id: string, name: string, lengthM: number): StreetSegment =>
  ({ id, name, highway: 'residential', district: 'Q', lengthM, coords: [[0, 0], [1, 0]], bbox: [0, 0, 1, 0] });
const cov = (status: 'gold' | 'pink', best: number, walks: string[], lastAt: number): SegmentCoverage => ({
  status, best, bestWalkId: walks[0], mask: '', walks: Object.fromEntries(walks.map((w) => [w, best])),
  passages: walks.length, firstAt: 1, lastAt, lastWalkId: walks[0],
});

const segs = [seg('a1', 'Rue A', 100), seg('a2', 'Rue A', 100), seg('b1', 'Rue B', 200), seg('c1', 'Rue C', 50), seg('x', '', 50)];
const streets: Streets = { version: 't', segments: segs, byId: new Map(segs.map((s) => [s.id, s])) };

describe('districtStats', () => {
  it('compte rues, mètres et tronçons du quartier', () => {
    const s = districtStats('Guilheméry', 'small', segs.map((x) => x.id), streets, {
      a1: cov('gold', 1, ['w1'], 10),
      a2: cov('gold', 0.95, ['w2'], 30),
      b1: cov('pink', 0.5, ['w1'], 20),
    });
    expect(s.totalM).toBe(500);
    expect(s.goldM).toBe(200);
    expect(s.doneM).toBe(100 + 95 + 100);
    expect([s.streets, s.goldStreets, s.pinkStreets]).toEqual([3, 1, 1]); // A dorée, B parcourue, C non faite
    expect(s.segments).toEqual({ gold: 2, pink: 1, none: 2 });
    expect(s.walks).toBe(2);
    expect(s.lastAt).toBe(30);
  });
});
