// Extrait les rues de la commune de Toulouse depuis OpenStreetMap (Overpass)
// et les découpe en tronçons (d'une intersection à la suivante).
// Usage : node scripts/extract-streets.mjs   → public/streets/toulouse.json
import { mkdirSync, writeFileSync } from 'node:fs';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// Voies comptées comme des « rues » (y compris chemins : bords de Garonne, canal…).
const HIGHWAYS = [
  'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'unclassified', 'residential', 'living_street', 'pedestrian', 'road',
  'footway', 'path', 'cycleway', 'steps', 'track', 'bridleway',
];

const QUERY = `
[out:json][timeout:300];
area["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"="31555"]->.toulouse;
way(area.toulouse)["highway"~"^(${HIGHWAYS.join('|')})$"];
out body geom;
`;

/** Règles d'exclusion : accès privés, trottoirs, passages piétons, surfaces, intérieur. */
function keep(tags) {
  const open = ['yes', 'designated', 'permissive'];
  if (['private', 'no', 'customers', 'delivery'].includes(tags.access) && !open.includes(tags.foot)) return false;
  if (['private', 'no'].includes(tags.foot)) return false;
  if (['sidewalk', 'crossing', 'traffic_island', 'access_aisle'].includes(tags.footway)) return false;
  if (['sidewalk', 'crossing'].includes(tags.path) || ['crossing'].includes(tags.cycleway)) return false;
  if (tags.area === 'yes' || tags.indoor === 'yes' || tags.indoor === 'corridor') return false;
  if (tags.highway === 'track' && ['grade3', 'grade4', 'grade5'].includes(tags.tracktype) && !open.includes(tags.foot)) return false;
  return true;
}

function haversine(a, b) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

console.log('Requête Overpass…');
const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: QUERY }) });
if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
const osm = await res.json();
const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry && keep(e.tags ?? {}));
console.log(`${osm.elements.length} voies reçues, ${ways.length} gardées`);

// Un nœud partagé par plusieurs voies (ou deux fois la même) est une intersection.
const usage = new Map();
for (const w of ways) for (const n of w.nodes) usage.set(n, (usage.get(n) ?? 0) + 1);

const names = [], nameIdx = new Map();
const highways = [], hwIdx = new Map();
const idx = (list, map, v) => {
  if (!map.has(v)) { map.set(v, list.length); list.push(v); }
  return map.get(v);
};

const segments = [];
for (const w of ways) {
  const coords = w.geometry.map((g) => [g.lon, g.lat]);
  let start = 0, k = 0;
  for (let i = 1; i < coords.length; i++) {
    const isEnd = i === coords.length - 1;
    if (!isEnd && (usage.get(w.nodes[i]) ?? 0) < 2) continue;
    const part = coords.slice(start, i + 1);
    let len = 0;
    for (let j = 1; j < part.length; j++) len += haversine(part[j - 1], part[j]);
    segments.push([
      `w${w.id}:${k++}`,
      idx(names, nameIdx, w.tags.name ?? ''),
      idx(highways, hwIdx, w.tags.highway),
      Math.round(len * 10) / 10,
      part.flatMap(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]),
    ]);
    start = i;
  }
}

const date = (osm.osm3s?.timestamp_osm_base ?? new Date().toISOString()).slice(0, 10);
const out = {
  version: `osm-${date}`,
  area: 'Commune de Toulouse (INSEE 31555)',
  attribution: '© OpenStreetMap contributors, ODbL',
  format: 'segments: [id, nameIndex, highwayIndex, lengthM, [lon, lat, lon, lat, …]]',
  names,
  highways,
  segments,
};
mkdirSync('public/streets', { recursive: true });
writeFileSync('public/streets/toulouse.json', JSON.stringify(out));
const km = segments.reduce((s, x) => s + x[3], 0) / 1000;
console.log(`${segments.length} tronçons, ${km.toFixed(0)} km, version ${out.version}`);
