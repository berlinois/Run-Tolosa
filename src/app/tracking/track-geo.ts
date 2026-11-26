import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { TrackPoint } from './model';

/** Au-delà, un point est trop imprécis pour être dessiné (il reste stocké). */
export const MAX_DISPLAY_ACCURACY_M = 25;

/** Trace affichable : points assez précis, dans l'ordre. Null s'il y a moins de 2 points. */
export function trackToLine(
  points: readonly TrackPoint[],
  props: Record<string, unknown> = {},
): Feature<LineString> | null {
  const coords = points
    .filter((p) => p.acc <= MAX_DISPLAY_ACCURACY_M)
    .map((p) => [p.lon, p.lat]);
  if (coords.length < 2) return null;
  return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } };
}

export function linesCollection(lines: (Feature<LineString> | null)[]): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: lines.filter((l): l is Feature<LineString> => l !== null) };
}

export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** En dessous, on propose de supprimer la marche à l'arrêt. */
export const MIN_WALK_DURATION_MS = 5 * 60 * 1000;

export function isTooShort(startedAt: number, endedAt: number): boolean {
  return endedAt - startedAt < MIN_WALK_DURATION_MS;
}
