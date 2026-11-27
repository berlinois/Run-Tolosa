// Tracés réels de la Garonne et des canaux toulousains (OSM), pour l'écran d'accueil.
// Usage : node scripts/extract-water.mjs   → public/streets/eau.geojson
import { mkdirSync, writeFileSync } from 'node:fs';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const QUERY = `
[out:json][timeout:180];
way["waterway"~"^(river|canal)$"]["name"~"^(La Garonne|Garonne|Canal du Midi|Canal de Brienne|Canal latéral à la Garonne)$"](43.50,1.30,43.70,1.56);
out tags geom;
`;

async function overpass(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'User-Agent': 'run-tolosa-street-extractor/1.0 (personal, non-commercial)', Accept: 'application/json' },
        body: new URLSearchParams({ data: query }),
      });
      if (res.ok) return res.json();
      console.warn(`Overpass HTTP ${res.status}, tentative ${attempt}/4`);
    } catch (e) {
      console.warn(`Overpass injoignable (${e.cause?.code ?? e.message}), tentative ${attempt}/4`);
    }
    await new Promise((r) => setTimeout(r, 30_000 * attempt));
  }
  throw new Error('Overpass indisponible');
}

const osm = await overpass(QUERY);
const r = (v) => Math.round(v * 1e5) / 1e5;
const features = osm.elements
  .filter((e) => e.type === 'way' && e.geometry)
  .map((e) => ({
    type: 'Feature',
    properties: { name: e.tags.name, kind: e.tags.waterway },
    geometry: { type: 'LineString', coordinates: e.geometry.map((g) => [r(g.lon), r(g.lat)]) },
  }));
mkdirSync('public/streets', { recursive: true });
writeFileSync('public/streets/eau.geojson', JSON.stringify({ type: 'FeatureCollection', attribution: '© OpenStreetMap contributors (ODbL)', features }));
const byName = {};
for (const f of features) byName[f.properties.name] = (byName[f.properties.name] ?? 0) + 1;
console.log(`${features.length} tronçons :`, byName);
