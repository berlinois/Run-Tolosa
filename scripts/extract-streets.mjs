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

async function overpass(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(OVERPASS, {
        method: 'POST',
        // Overpass rejette (HTTP 406) les clients sans User-Agent explicite.
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

console.log('Requête Overpass (rues)…');
const osm = await overpass(QUERY);
const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry && keep(e.tags ?? {}));
console.log(`${osm.elements.length} voies reçues, ${ways.length} gardées`);

// ---- Quartiers : on prend le découpage administratif le plus fin disponible dans Toulouse.
const HW = `["highway"~"^(${HIGHWAYS.join('|')})$"]`;
let districts = [];
const wayDistrict = new Map();
for (const level of ['10', '9']) {
  const q = `[out:json][timeout:600];
area["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"="31555"]->.t;
rel(area.t)["boundary"="administrative"]["admin_level"="${level}"];
foreach -> .d (
  .d out tags;
  .d map_to_area -> .a;
  way(area.a)${HW};
  out ids;
);`;
  console.log(`Requête Overpass (quartiers, admin_level=${level})…`);
  const res = await overpass(q);
  let current = null;
  const found = [];
  for (const e of res.elements) {
    if (e.type === 'relation') {
      current = e.tags?.name ?? `relation ${e.id}`;
      found.push(current);
    } else if (e.type === 'way' && current && !wayDistrict.has(e.id)) {
      wayDistrict.set(e.id, current);
    }
  }
  console.log(`  admin_level=${level} : ${found.length} quartiers`, found.join(', '));
  if (found.length >= 5) {
    districts = found;
    console.log(`  → découpage retenu : admin_level=${level}`);
    break;
  }
  wayDistrict.clear();
}

// Un nœud partagé par plusieurs voies (ou deux fois la même) est une intersection.
const usage = new Map();
for (const w of ways) for (const n of w.nodes) usage.set(n, (usage.get(n) ?? 0) + 1);

const names = [], nameIdx = new Map();
const districtNames = [], districtIdx = new Map();
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
      wayDistrict.has(w.id) ? idx(districtNames, districtIdx, wayDistrict.get(w.id)) : -1,
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
  format: 'segments: [id, nameIndex, highwayIndex, lengthM, districtIndex (-1 = aucun), [lon, lat, lon, lat, …]]',
  names,
  highways,
  districts: districtNames,
  segments,
};
mkdirSync('public/streets', { recursive: true });
writeFileSync('public/streets/toulouse.json', JSON.stringify(out));
const km = segments.reduce((s, x) => s + x[3], 0) / 1000;
console.log(`${segments.length} tronçons, ${km.toFixed(0)} km, version ${out.version}`);
const noDistrict = segments.filter((x) => x[4] === -1).length;
console.log(`${districtNames.length} quartiers, ${noDistrict} tronçons sans quartier`);
const perHw = {};
for (const x of segments) perHw[highways[x[2]]] = (perHw[highways[x[2]]] ?? 0) + x[3] / 1000;
console.log('km par type :', Object.entries(perHw).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
