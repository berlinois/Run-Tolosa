import type { TrackPoint } from './model';
import { formatDistance, formatDuration, linesCollection, trackToLine } from './track-geo';

const pt = (lon: number, lat: number, acc = 5): TrackPoint => ({ t: 0, lat, lon, acc });

describe('track-geo', () => {
  it('construit une ligne en ignorant les points imprécis', () => {
    const line = trackToLine([pt(1.44, 43.6), pt(1.45, 43.61, 80), pt(1.46, 43.62)], { id: 'w' });
    expect(line?.geometry.coordinates).toEqual([
      [1.44, 43.6],
      [1.46, 43.62],
    ]);
    expect(line?.properties).toEqual({ id: 'w' });
  });

  it('renvoie null avec moins de 2 points exploitables', () => {
    expect(trackToLine([])).toBeNull();
    expect(trackToLine([pt(1.44, 43.6), pt(1.45, 43.61, 30)])).toBeNull();
  });

  it('ignore les traces vides dans une collection', () => {
    expect(linesCollection([null, trackToLine([pt(1, 2), pt(3, 4)])]).features).toHaveLength(1);
  });

  it('formate distances et durées', () => {
    expect(formatDistance(842.4)).toBe('842 m');
    expect(formatDistance(5240)).toBe('5,24 km');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
