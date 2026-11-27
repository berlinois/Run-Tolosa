import type { TrackPoint } from '../tracking/model';
import { coveredParts, matchWalk, statusFor } from './matcher';
import type { StreetSegment } from './streets';

// ~1 m ≈ 0.000009° de latitude à Toulouse ; ~0.0000124° de longitude.
const LAT0 = 43.6, LON0 = 1.44;
const DLAT = 1 / 110_574, DLON = 1 / (111_320 * Math.cos((LAT0 * Math.PI) / 180));

/** Tronçon horizontal (est-ouest) de `len` m, décalé de `north` m vers le nord. */
function seg(id: string, len: number, north = 0, east = 0): StreetSegment {
  const lat = LAT0 + north * DLAT;
  const a: [number, number] = [LON0 + east * DLON, lat];
  const b: [number, number] = [LON0 + (east + len) * DLON, lat];
  return { id, name: id, highway: 'residential', district: '', lengthM: len, coords: [a, b], bbox: [a[0], lat, b[0], lat] };
}

/** Marche en ligne droite est-ouest de `from` à `to` m, un point par 1,5 m, décalée de `north` m. */
function walk(from: number, to: number, north = 0, acc = 5): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let m = from; m <= to; m += 1.5) pts.push({ t: m * 1000, lat: LAT0 + north * DLAT, lon: LON0 + m * DLON, acc });
  return pts;
}

const statusOf = (pts: TrackPoint[], s: StreetSegment) => {
  const m = matchWalk(pts, [s])[0];
  return m ? statusFor(m.ratio * s.lengthM, s.lengthM) : null;
};

describe('statusFor (rue entière, meilleure marche)', () => {
  it('doré si la partie manquante tient dans 10 m + 3 % de la longueur', () => {
    expect(statusFor(90, 100)).toBe('gold'); // 10 m manquants ≤ 13 m
    expect(statusFor(86, 100)).toBe('pink'); // 14 m > 13 m
    expect(statusFor(960, 1000)).toBe('gold'); // 40 m ≤ 40 m
    expect(statusFor(950, 1000)).toBe('pink');
    expect(statusFor(21, 30)).toBe('gold'); // petite rue : 9 m ≤ 10,9 m
  });

  it('rose à partir de 30 % ou de 300 m, rien en dessous', () => {
    expect(statusFor(60, 200)).toBe('pink');
    expect(statusFor(58, 200)).toBeNull();
    expect(statusFor(300, 1500)).toBe('pink'); // 20 % mais 300 m
    expect(statusFor(290, 1500)).toBeNull();
  });

  it("ne valide pas une toute petite rue qu'on n'a pas assez parcourue", () => {
    expect(statusFor(0, 4)).toBeNull();
    expect(statusFor(3.2, 8)).toBe('pink');
    expect(statusFor(4.8, 8)).toBe('gold');
  });
});

describe('matchWalk', () => {
  it('rue parcourue en entier, même avec un décalage GPS de 8 m : doré', () => {
    expect(statusOf(walk(0, 100, 8), seg('a', 100))).toBe('gold');
  });

  it('rue faite à moitié : rose ; à 20 % : rien', () => {
    expect(statusOf(walk(0, 50), seg('a', 100))).toBe('pink');
    expect(statusOf(walk(0, 20), seg('a', 300))).toBeNull();
  });

  it('ne touche pas une rue parallèle à plus de 12 m', () => {
    expect(matchWalk(walk(0, 100), [seg('a', 100), seg('parallele', 100, 25)]).map((m) => m.id)).toEqual(['a']);
  });

  it('ne compte pas une rue seulement croisée', () => {
    const lon = LON0 + 50 * DLON;
    const cross: StreetSegment = {
      id: 'croisee', name: '', highway: 'residential', district: '', lengthM: 80,
      coords: [[lon, LAT0 - 40 * DLAT], [lon, LAT0 + 40 * DLAT]],
      bbox: [lon, LAT0 - 40 * DLAT, lon, LAT0 + 40 * DLAT],
    };
    expect(statusOf(walk(0, 100), cross)).toBeNull();
  });

  it("ne compte pas un court tronçon d'intersection simplement traversé", () => {
    const pts: TrackPoint[] = [];
    for (let m = -40; m <= 40; m += 1.5) pts.push({ t: m, lat: LAT0 + m * DLAT, lon: LON0, acc: 5 });
    expect(statusOf(pts, seg('court', 40))).toBeNull();
  });

  it('ignore les points imprécis', () => {
    expect(matchWalk(walk(0, 100, 0, 60), [seg('a', 100)])).toEqual([]);
  });

  it('comble les petits trous de la trace', () => {
    const pts = walk(0, 100).filter((_, i) => i % 15 === 0); // un point tous les ~22 m
    expect(statusOf(pts, seg('a', 100))).toBe('gold');
  });

  it('garde le masque des mètres parcourus et sait redessiner ces morceaux', () => {
    const s = seg('a', 100);
    const m = matchWalk(walk(0, 50), [s])[0];
    expect(m.mask).toMatch(/^1+0+$/); // début parcouru, fin non parcourue
    const parts = coveredParts(s.coords, m.mask);
    expect(parts).toHaveLength(1);
    const endM = (parts[0].at(-1)![0] - LON0) / DLON;
    expect(endM).toBeGreaterThan(48);
    expect(endM).toBeLessThan(60);
  });
});
