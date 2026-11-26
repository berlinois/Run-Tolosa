/** Référentiel des tronçons de rue (public/streets/toulouse.json, généré par scripts/extract-streets.mjs). */

export interface StreetsFile {
  version: string;
  names: string[];
  highways: string[];
  districts: string[];
  /** [id, nameIndex, highwayIndex, lengthM, districtIndex (-1 = aucun), [lon, lat, lon, lat, …]] */
  segments: [string, number, number, number, number, number[]][];
}

export interface StreetSegment {
  id: string;
  name: string;
  highway: string;
  /** Quartier (vide si inconnu). */
  district: string;
  lengthM: number;
  /** [lon, lat][] */
  coords: [number, number][];
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
}

export interface Streets {
  version: string;
  segments: StreetSegment[];
  byId: Map<string, StreetSegment>;
}

export function parseStreets(file: StreetsFile): Streets {
  const segments = file.segments.map(([id, n, h, lengthM, d, flat]) => {
    const coords: [number, number][] = [];
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      const lon = flat[i], lat = flat[i + 1];
      coords.push([lon, lat]);
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return {
      id,
      name: file.names[n] ?? '',
      highway: file.highways[h] ?? '',
      district: file.districts[d] ?? '',
      lengthM,
      coords,
      bbox: [minLon, minLat, maxLon, maxLat] as [number, number, number, number],
    };
  });
  return { version: file.version, segments, byId: new Map(segments.map((s) => [s.id, s])) };
}
