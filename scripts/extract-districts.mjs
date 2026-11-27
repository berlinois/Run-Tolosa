// Extrait les contours des 20 quartiers de Toulouse (OSM, admin_level=10).
// Usage : node scripts/extract-districts.mjs   → public/streets/quartiers.geojson
import { mkdirSync, writeFileSync } from 'node:fs';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const QUERY = `
[out:json][timeout:300];
area["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"="31555"]->.t;
rel(area.t)["boundary"="administrative"]["admin_level"="10"];
out geom;
`;

async function overpass(query) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': 'run-tolosa-street-extractor/1.0 (personal, non-commercial)', Accept: 'application/json' },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.json();
    console.warn(`Overpass HTTP ${res.status}, tentative ${attempt}/3`);
    await new Promise((r) => setTimeout(r, 30_000 * attempt));
  }
  throw new Error('Overpass indisponible');
}

const round = (v) => Math.round(v * 1e6) / 1e6;

console.log('Requête Overpass (contours des quartiers)…');
const osm = await overpass(QUERY);
const features = [];
for (const rel of osm.elements.filter((e) => e.type === 'relation')) {
  const lines = rel.members
    .filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === ''))
    .map((m) => m.geometry.map((g) => [round(g.lon), round(g.lat)]));
  if (lines.length === 0) continue;
  const label = rel.members.find((m) => m.type === 'node' && (m.role === 'label' || m.role === 'admin_centre'));
  let lon, lat;
  if (label) {
    [lon, lat] = [label.lon, label.lat];
  } else {
    const pts = lines.flat();
    lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  }
  features.push({
    type: 'Feature',
    properties: { name: rel.tags?.name ?? `relation ${rel.id}`, ref: rel.tags?.ref ?? null, osmId: rel.id, labelLon: round(lon), labelLat: round(lat) },
    geometry: { type: 'MultiLineString', coordinates: lines },
  });
}
features.sort((a, b) => String(a.properties.ref ?? a.properties.name).localeCompare(String(b.properties.ref ?? b.properties.name), 'fr', { numeric: true }));
mkdirSync('public/streets', { recursive: true });
writeFileSync('public/streets/quartiers.geojson', JSON.stringify({ type: 'FeatureCollection', attribution: '© OpenStreetMap contributors, ODbL', features }));
console.log(`${features.length} quartiers :`);
for (const f of features) console.log(`  ${f.properties.ref ?? '-'} ${f.properties.name} (${f.geometry.coordinates.length} lignes)`);
