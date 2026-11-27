import type { TrackPoint } from '../tracking/model';
import type { StreetSegment } from './streets';

/**
 * Association points GPS → tronçons de rue, marche par marche (pas de cumul
 * entre marches : une rue est jugée sur la meilleure marche).
 *  - rose : au moins PINK_MIN_RATIO de la longueur parcourue en une marche ;
 *  - doré : en une marche, la partie non parcourue fait au plus
 *           GOLD_BASE_TOLERANCE_M + GOLD_TOLERANCE_RATIO × longueur
 *           (marge plus large pour les petites rues, plus stricte pour les longues).
 * Changer un paramètre = changer MATCHER_ID : tout est recalculé depuis les traces.
 */
export const MATCHER_ID = 'matcher-v3';
export const MAX_POINT_ACCURACY_M = 25;
export const MATCH_RADIUS_M = 12;
export const PINK_MIN_RATIO = 0.3;
export const GOLD_BASE_TOLERANCE_M = 10;
export const GOLD_TOLERANCE_RATIO = 0.03;
export const GOLD_MIN_RATIO = 0.5;

export type StreetStatus = 'gold' | 'pink';

/** Statut d'un tronçon pour une couverture donnée (part de la longueur, 0 à 1). */
export function statusFor(ratio: number, lengthM: number): StreetStatus | null {
  if (ratio < PINK_MIN_RATIO) return null;
  const missing = (1 - ratio) * lengthM;
  // Garde-fou : sur un tout petit tronçon, la marge de 10 m suffirait à le valider
  // sans l'avoir parcouru ; on exige au moins la moitié pour le doré.
  if (ratio >= GOLD_MIN_RATIO && missing <= GOLD_BASE_TOLERANCE_M + GOLD_TOLERANCE_RATIO * lengthM + 1e-6) return 'gold';
  return 'pink';
}

/** Couverture d'un tronçon par une marche. */
export interface SegmentMatch {
  id: string;
  /** Part de la longueur parcourue, de 0 à 1. */
  ratio: number;
  /** Échantillons parcourus le long du tronçon ('1') ou non ('0'), tous les ~4 m. */
  mask: string;
}
/** Pas d'échantillonnage le long des tronçons. */
const SAMPLE_STEP_M = 4;
/**
 * Tolérance dans le sens de la rue : un point GPS ne « couvre » la rue que
 * sur ±ALONG_TOLERANCE_M autour de sa projection (sinon le rayon de 12 m
 * étirerait la couverture au-delà de l'endroit où l'on s'est arrêté).
 */
const ALONG_TOLERANCE_M = 5;
/** Trou dans la trace au-delà duquel on n'interpole pas (signal perdu, transport…). */
const MAX_INTERPOLATION_GAP_M = 40;

const M_PER_DEG_LAT = 110_574;

/** Projection locale en mètres (précise à l'échelle d'une ville). */
class LocalProjection {
  private readonly mPerDegLon: number;
  constructor(lat0: number) {
    this.mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  }
  x(lon: number): number {
    return lon * this.mPerDegLon;
  }
  y(lat: number): number {
    return lat * M_PER_DEG_LAT;
  }
}

/** Grille de hachage des points de la trace (cellule = rayon de recherche). */
class PointGrid {
  private readonly cells = new Map<string, number[]>();
  constructor(private readonly cell: number) {}
  private key(cx: number, cy: number): string {
    return `${cx}:${cy}`;
  }
  add(x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const list = this.cells.get(k);
    if (list) list.push(x, y);
    else this.cells.set(k, [x, y]);
  }
  /**
   * Existe-t-il un point de la trace à moins de `lateral` m de part et d'autre
   * de la rue et à moins de `along` m dans son sens (direction unitaire ux, uy) ?
   */
  hasNear(x: number, y: number, ux: number, uy: number, lateral: number, along: number): boolean {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const pts = this.cells.get(this.key(cx + dx, cy + dy));
        if (!pts) continue;
        for (let i = 0; i < pts.length; i += 2) {
          const ex = pts[i] - x, ey = pts[i + 1] - y;
          if (Math.abs(ex * ux + ey * uy) <= along && Math.abs(ex * uy - ey * ux) <= lateral) return true;
        }
      }
    }
    return false;
  }
}

/** Tronçons parcourus par une marche (rose ou doré), avec leur couverture. */
export function matchWalk(points: readonly TrackPoint[], segments: readonly StreetSegment[]): SegmentMatch[] {
  const good = points.filter((p) => p.acc <= MAX_POINT_ACCURACY_M);
  if (good.length < 2) return [];

  const proj = new LocalProjection(good[0].lat);
  const grid = new PointGrid(MATCH_RADIUS_M);
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;

  // Trace densifiée : points intermédiaires tous les ~3 m quand le trou est raisonnable.
  for (let i = 0; i < good.length; i++) {
    const p = good[i];
    const x = proj.x(p.lon), y = proj.y(p.lat);
    grid.add(x, y);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    if (i === 0) continue;
    const q = good[i - 1];
    const qx = proj.x(q.lon), qy = proj.y(q.lat);
    const d = Math.hypot(x - qx, y - qy);
    if (d > 3 && d <= MAX_INTERPOLATION_GAP_M) {
      const n = Math.ceil(d / 3);
      for (let k = 1; k < n; k++) grid.add(qx + ((x - qx) * k) / n, qy + ((y - qy) * k) / n);
    }
  }

  // Marge en degrés autour de la trace pour présélectionner les tronçons.
  const mLat = MATCH_RADIUS_M / M_PER_DEG_LAT;
  const mLon = MATCH_RADIUS_M / (111_320 * Math.cos((good[0].lat * Math.PI) / 180));

  const matched: SegmentMatch[] = [];
  for (const s of segments) {
    const [a, b, c, d] = s.bbox;
    if (c < minLon - mLon || a > maxLon + mLon || d < minLat - mLat || b > maxLat + mLat) continue;
    const { ratio, mask } = coverage(s, proj, grid);
    if (statusFor(ratio, s.lengthM)) matched.push({ id: s.id, ratio: Math.round(ratio * 1000) / 1000, mask });
  }
  return matched;
}

/** Projection de référence (fixe) pour que l'échantillonnage d'un tronçon soit toujours le même. */
const REF = new LocalProjection(43.6);

/** Nombre d'échantillons sur chaque portion [i, i+1] du tracé (0 si portion de longueur nulle). */
export function sampleCounts(coords: readonly [number, number][]): number[] {
  const counts: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const len = Math.hypot(REF.x(coords[i][0]) - REF.x(coords[i - 1][0]), REF.y(coords[i][1]) - REF.y(coords[i - 1][1]));
    counts.push(len === 0 ? 0 : Math.max(1, Math.round(len / SAMPLE_STEP_M)));
  }
  return counts;
}

/** Morceaux du tronçon réellement parcourus, d'après le masque d'échantillons. */
export function coveredParts(coords: readonly [number, number][], mask: string): [number, number][][] {
  const counts = sampleCounts(coords);
  const parts: [number, number][][] = [];
  let current: [number, number][] | null = null;
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    const n = counts[i - 1];
    const [a, b] = [coords[i - 1], coords[i]];
    const at = (t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let k = 0; k < n; k++, m++) {
      if (mask[m] === '1') {
        if (!current) { current = [at(k / n)]; parts.push(current); }
        current.push(at((k + 1) / n));
      } else {
        current = null;
      }
    }
  }
  return parts;
}

/** Part de la longueur du tronçon à moins de MATCH_RADIUS_M de la trace. */
function coverage(s: StreetSegment, proj: LocalProjection, grid: PointGrid): { ratio: number; mask: string } {
  let total = 0, covered = 0, mask = '';
  const counts = sampleCounts(s.coords);
  for (let i = 1; i < s.coords.length; i++) {
    const [lon0, lat0] = s.coords[i - 1], [lon1, lat1] = s.coords[i];
    const x0 = proj.x(lon0), y0 = proj.y(lat0), x1 = proj.x(lon1), y1 = proj.y(lat1);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = counts[i - 1];
    if (len === 0 || n === 0) continue;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    // Échantillons au milieu de chaque pas, chacun pèse len / n.
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const hit = grid.hasNear(x, y, ux, uy, MATCH_RADIUS_M, ALONG_TOLERANCE_M);
      if (hit) covered += len / n;
      mask += hit ? '1' : '0';
    }
    total += len;
  }
  return { ratio: total > 0 ? covered / total : 0, mask };
}
