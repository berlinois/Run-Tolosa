import type { TrackPoint } from '../tracking/model';
import { matchWalk } from './matcher';
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
  for (let m = from; m <= to; m += 1.5) {
    pts.push({ t: m * 1000, lat: LAT0 + north * DLAT, lon: LON0 + m * DLON, acc });
  }
  return pts;
}

describe('matchWalk', () => {
  it('valide une rue parcourue en entier, même avec un décalage GPS de 8 m', () => {
    expect(matchWalk(walk(0, 100, 8), [seg('a', 100)])).toEqual(['a']);
  });

  it('valide à partir de 60 % de la longueur, pas en dessous', () => {
    expect(matchWalk(walk(0, 65), [seg('a', 100)])).toEqual(['a']);
    expect(matchWalk(walk(0, 50), [seg('a', 100)])).toEqual([]);
  });

  it("ne valide pas une rue parallèle à plus de 12 m", () => {
    expect(matchWalk(walk(0, 100), [seg('a', 100), seg('parallele', 100, 25)])).toEqual(['a']);
  });

  it('ne valide pas une rue seulement croisée', () => {
    // Rue nord-sud de 80 m traversée au milieu par la marche est-ouest.
    const lon = LON0 + 50 * DLON;
    const cross: StreetSegment = {
      id: 'croisee', name: '', highway: 'residential', district: '', lengthM: 80,
      coords: [[lon, LAT0 - 40 * DLAT], [lon, LAT0 + 40 * DLAT]],
      bbox: [lon, LAT0 - 40 * DLAT, lon, LAT0 + 40 * DLAT],
    };
    expect(matchWalk(walk(0, 100), [cross])).toEqual([]);
  });

  it('ignore les points imprécis', () => {
    expect(matchWalk(walk(0, 100, 0, 60), [seg('a', 100)])).toEqual([]);
  });

  it("ne valide pas un court tronçon d'intersection simplement traversé", () => {
    // Marche nord-sud qui passe par l'extrémité d'un tronçon est-ouest de 15 m.
    const pts: TrackPoint[] = [];
    for (let m = -40; m <= 40; m += 1.5) pts.push({ t: m, lat: LAT0 + m * DLAT, lon: LON0, acc: 5 });
    expect(matchWalk(pts, [seg('court', 15)])).toEqual([]);
  });

  it('comble les petits trous de la trace', () => {
    const pts = walk(0, 100).filter((_, i) => i % 15 === 0); // un point tous les ~22 m
    expect(matchWalk(pts, [seg('a', 100)])).toEqual(['a']);
  });
});
