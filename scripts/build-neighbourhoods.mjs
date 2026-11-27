// Construit les petits quartiers à partir des IRIS (sans réseau) :
//  1. un IRIS qui porte déjà un vrai nom de quartier le garde ;
//  2. sinon (nom de rue, de lieu…) il prend le nom du quartier OSM situé dedans
//     (le plus proche de son centre), ou à défaut du quartier OSM le plus proche ;
//  3. les IRIS qui finissent avec le même nom sont réunis (contours internes retirés).
// Usage : node scripts/build-neighbourhoods.mjs → public/streets/petits-quartiers.geojson
import { readFileSync, writeFileSync } from 'node:fs';

const iris = JSON.parse(readFileSync('public/streets/iris.geojson', 'utf8'));
const big = JSON.parse(readFileSync('public/streets/quartiers.geojson', 'utf8'));

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Noms de quartiers reconnus : points OSM + sous-noms des 20 grands quartiers.
const known = new Map(); // forme normalisée → graphie à afficher
for (const p of iris.places) known.set(norm(p.name), p.name);
for (const f of big.features) for (const part of String(f.properties.name).split('/')) {
  const n = part.trim();
  if (n.length >= 4 && !known.has(norm(n))) known.set(norm(n), n);
}
const words = (s) => ` ${s} `;
/** Le nom IRIS est-il un vrai nom de quartier ? Renvoie la graphie à garder, ou null. */
function quarterName(irisName) {
  const n = norm(irisName);
  if (known.has(n)) return irisName;
  for (const k of known.keys()) {
    if (k.length >= 6 && n.length >= 6 && lev(k, n) <= 2) return irisName; // Montplaisir ≈ Monplaisir
    if (k.length >= 5 && words(n).includes(words(k))) return irisName; // « Lalande Nord », « Cité Amouroux »
  }
  return null;
}

const dist2 = (a, b) => ((a[0] - b[0]) * Math.cos((43.6 * Math.PI) / 180)) ** 2 + (a[1] - b[1]) ** 2;
const placeByName = new Map(iris.places.map((p) => [p.name, p]));

const decisions = [];
for (const f of iris.features) {
  const p = f.properties;
  const center = [p.labelLon, p.labelLat];
  let name = quarterName(p.name);
  let why = 'nom IRIS gardé';
  if (!name) {
    const inside = p.osmNames.map((n) => placeByName.get(n)).filter(Boolean);
    const pool = inside.length ? inside : iris.places;
    const best = pool.reduce((a, b) => (dist2([a.lon, a.lat], center) <= dist2([b.lon, b.lat], center) ? a : b));
    name = best.name;
    why = inside.length ? 'quartier OSM dans la zone' : 'quartier OSM le plus proche';
  }
  f.properties.quartier = name;
  decisions.push(`${p.code} ${p.name.padEnd(28)} → ${name}  (${why})`);
}

// Regroupement : on retire les arêtes partagées par deux IRIS du même quartier.
const rings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flatMap((poly) => poly);
const key = (a, b) => { const s = `${a[0]},${a[1]}`, t = `${b[0]},${b[1]}`; return s < t ? `${s}|${t}` : `${t}|${s}`; };
const edgeOwners = new Map();
for (const f of iris.features) for (const r of rings(f.geometry)) for (let i = 1; i < r.length; i++) {
  const k = key(r[i - 1], r[i]);
  (edgeOwners.get(k) ?? edgeOwners.set(k, []).get(k)).push(f.properties.quartier);
}
const groups = new Map();
for (const f of iris.features) (groups.get(f.properties.quartier) ?? groups.set(f.properties.quartier, []).get(f.properties.quartier)).push(f);

const features = [];
for (const [name, members] of groups) {
  const lines = [];
  for (const f of members) for (const r of rings(f.geometry)) {
    let run = [];
    for (let i = 1; i < r.length; i++) {
      const owners = edgeOwners.get(key(r[i - 1], r[i]));
      const internal = owners.length > 1 && owners.every((o) => o === name);
      if (internal) { if (run.length > 1) lines.push(run); run = []; continue; }
      if (run.length === 0) run.push(r[i - 1]);
      run.push(r[i]);
    }
    if (run.length > 1) lines.push(run);
  }
  const place = placeByName.get(name);
  const biggest = members.reduce((a, b) => (JSON.stringify(a.geometry).length >= JSON.stringify(b.geometry).length ? a : b));
  const label = place && members.some((m) => m.properties.osmNames.includes(name))
    ? [place.lon, place.lat]
    : [biggest.properties.labelLon, biggest.properties.labelLat];
  features.push({
    type: 'Feature',
    properties: { name, iris: members.map((m) => m.properties.code), labelLon: label[0], labelLat: label[1] },
    geometry: { type: 'MultiLineString', coordinates: lines },
  });
}
features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'fr'));
writeFileSync('public/streets/petits-quartiers.geojson', JSON.stringify({
  type: 'FeatureCollection',
  attribution: 'Contours IRIS © INSEE / IGN (Licence Ouverte) ; noms © OpenStreetMap contributors (ODbL)',
  features,
}));
console.log(decisions.join('\n'));
console.log(`\n${iris.features.length} IRIS → ${features.length} petits quartiers`);
