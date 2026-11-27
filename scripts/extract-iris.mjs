// Contours IRIS (INSEE / IGN, Licence Ouverte) de la commune de Toulouse,
// enrichis des noms de quartiers OSM (points place=*) qui tombent dans chaque IRIS.
// Usage : node scripts/extract-iris.mjs   → public/streets/iris.geojson
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = { 'User-Agent': 'run-tolosa-street-extractor/1.0 (personal, non-commercial)' };
const WFS = 'https://data.geopf.fr/wfs/ows';

async function get(url, init = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) } });
      if (res.ok) return res;
      console.warn(`HTTP ${res.status} sur ${url.slice(0, 120)}, tentative ${attempt}/4`);
      if (res.status === 400) return res; // requête invalide : inutile d'insister
    } catch (e) {
      console.warn(`Injoignable (${e.cause?.code ?? e.message}), tentative ${attempt}/4`);
    }
    await new Promise((r) => setTimeout(r, 20_000 * attempt));
  }
  throw new Error(`Indisponible : ${url}`);
}

// 1. Trouver le nom exact de la couche IRIS sur la Géoplateforme.
const caps = await (await get(`${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`)).text();
const typenames = [...caps.matchAll(/<(?:wfs:)?Name>([^<]*IRIS[^<]*)<\/(?:wfs:)?Name>/gi)].map((m) => m[1]);
console.log('Couches IRIS disponibles :', typenames.join(', ') || '(aucune)');
const typename = typenames.find((t) => /contours?_iris/i.test(t)) ?? typenames[0];
if (!typename) throw new Error('Aucune couche IRIS trouvée');
console.log('Couche utilisée :', typename);

// 2. Récupérer les IRIS de Toulouse (le nom du champ code commune varie selon les versions).
let features = [];
for (const filter of ["insee_com='31555'", "code_insee='31555'", "INSEE_COM='31555'", "code_iris LIKE '31555%'", "CODE_IRIS LIKE '31555%'"]) {
  const url = `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${encodeURIComponent(typename)}` +
    `&OUTPUTFORMAT=${encodeURIComponent('application/json')}&SRSNAME=EPSG:4326&COUNT=1000&CQL_FILTER=${encodeURIComponent(filter)}`;
  const res = await get(url);
  if (!res.ok) { console.log(`Filtre ${filter} : refusé`); continue; }
  const json = await res.json().catch(() => null);
  const n = json?.features?.length ?? 0;
  console.log(`Filtre ${filter} : ${n} IRIS`);
  if (n > 0) { features = json.features; break; }
}
if (features.length === 0) throw new Error('Aucun IRIS récupéré pour Toulouse');
console.log('Champs :', Object.keys(features[0].properties).join(', '));

// Ordre des axes : on veut [lon, lat] (lon ≈ 1.4, lat ≈ 43.6 à Toulouse).
const first = JSON.stringify(features[0].geometry.coordinates).match(/-?\d+\.\d+/g).map(Number);
const swap = first[0] > 10;
const fix = (c) => (typeof c[0] === 'number' ? (swap ? [c[1], c[0]] : c).map((v) => Math.round(v * 1e6) / 1e6) : c.map(fix));

const pick = (p, ...keys) => {
  for (const k of keys) for (const pk of Object.keys(p)) if (pk.toLowerCase() === k) return p[pk];
  return null;
};

// 3. Noms de quartiers OSM (points) pour chaque IRIS.
const overpassQuery = `[out:json][timeout:180];
area["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"="31555"]->.t;
node(area.t)["place"~"^(suburb|quarter|neighbourhood)$"]["name"];
out;`;
const osm = await (await get('https://overpass-api.de/api/interpreter', {
  method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams({ data: overpassQuery }),
})).json();
const places = osm.elements.map((e) => ({ name: e.tags.name, place: e.tags.place, lon: e.lon, lat: e.lat }));
console.log(`${places.length} points de quartiers OSM`);

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeometry(x, y, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h)));
}

const out = features.map((f) => {
  const geometry = { type: f.geometry.type, coordinates: fix(f.geometry.coordinates) };
  const osmNames = places.filter((p) => inGeometry(p.lon, p.lat, geometry)).map((p) => p.name);
  const pts = JSON.stringify(geometry.coordinates).match(/-?\d+\.\d+/g).map(Number);
  let lon = 0, lat = 0;
  for (let i = 0; i < pts.length; i += 2) { lon += pts[i]; lat += pts[i + 1]; }
  return {
    type: 'Feature',
    properties: {
      code: pick(f.properties, 'code_iris', 'iris'),
      name: pick(f.properties, 'nom_iris'),
      type: pick(f.properties, 'type_iris', 'typ_iris'),
      osmNames,
      labelLon: Math.round((lon / (pts.length / 2)) * 1e6) / 1e6,
      labelLat: Math.round((lat / (pts.length / 2)) * 1e6) / 1e6,
    },
    geometry,
  };
}).sort((a, b) => String(a.properties.code).localeCompare(String(b.properties.code)));

mkdirSync('public/streets', { recursive: true });
writeFileSync('public/streets/iris.geojson', JSON.stringify({
  type: 'FeatureCollection',
  attribution: 'Contours IRIS © INSEE / IGN (Licence Ouverte) ; noms de quartiers © OpenStreetMap contributors (ODbL)',
  // Points des quartiers OSM (place=suburb|quarter|neighbourhood), pour nommer les IRIS.
  places: places.map((p) => ({ ...p, lon: Math.round(p.lon * 1e6) / 1e6, lat: Math.round(p.lat * 1e6) / 1e6 })),
  features: out,
}));
console.log(`\n${out.length} IRIS écrits :`);
for (const f of out) console.log(`  ${f.properties.code} ${f.properties.name} [${f.properties.type}] ← OSM : ${f.properties.osmNames.join(', ') || '-'}`);
