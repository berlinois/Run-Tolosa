// Construit les petits quartiers à partir des IRIS (sans réseau) :
//  1. un IRIS qui porte déjà un vrai nom de quartier le garde ;
//  2. sinon (nom de rue, de lieu…) il prend le nom du quartier OSM situé dedans
//     (le plus proche de son centre), ou à défaut du quartier OSM le plus proche ;
//  3. les IRIS qui finissent avec le même nom sont réunis (contours internes retirés).
// Usage : node scripts/build-neighbourhoods.mjs
//   → public/streets/petits-quartiers.geojson (contours + nom au centre visuel)
//   → public/streets/grands-quartiers.geojson (20 quartiers en polygones, nom au centre visuel)
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
  const k = norm(n);
  // Variante d'orthographe d'un nom OSM (Montplaisir / Monplaisir) : on garde celle d'OSM.
  const variant = [...known.keys()].some((o) => o.length >= 7 && k.length >= 7 && lev(o, k) <= 1);
  if (n.length >= 4 && !known.has(k) && !variant) known.set(k, n);
}
const words = (s) => ` ${s} `;
/** Le nom IRIS est-il un vrai nom de quartier ? Renvoie la graphie à garder, ou null. */
function quarterName(irisName) {
  const n = norm(irisName);
  if (known.has(n)) return known.get(n); // graphie OSM : « Ponts-Jumeaux »
  for (const [k, display] of known) {
    if (k.length >= 7 && n.length >= 7 && lev(k, n) <= 1) return display; // Montplaisir → Monplaisir, Michoum → Michoun
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

// Centre visuel (« pôle d'inaccessibilité ») : le point de la zone le plus éloigné
// de ses bords extérieurs. Recherche sur grille puis affinages successifs.
const K = Math.cos((43.6 * Math.PI) / 180); // longitude → distance comparable à la latitude
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const insideAny = (x, y, geoms) => geoms.some((g) =>
  (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h))));
function distToLines(x, y, lines) {
  let best = Infinity;
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    const ax = l[i - 1][0] * K, ay = l[i - 1][1], bx = l[i][0] * K, by = l[i][1], px = x * K;
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}
function visualCenter(geoms, lines) {
  const pts = lines.flat();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let best = null, bestD = -1;
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  for (let pass = 0; pass < 5; pass++) {
    const n = pass === 0 ? 40 : 12;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = cx - w / 2 + (w * i) / n, y = cy - h / 2 + (h * j) / n;
      if (!insideAny(x, y, geoms)) continue;
      const d = distToLines(x, y, lines);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    if (!best) break;
    [cx, cy] = best; w /= 6; h /= 6;
  }
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return best ? [r(best[0]), r(best[1])] : [r((x0 + x1) / 2), r((y0 + y1) / 2)];
}

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
  const label = visualCenter(members.map((m) => m.geometry), lines);
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

// ---- Grands quartiers : on recolle les morceaux de frontière OSM en anneaux fermés.
function joinRings(lines) {
  const k = (p) => `${p[0]},${p[1]}`;
  const pool = lines.map((l) => l.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (k(ring[0]) !== k(ring[ring.length - 1]) && guard++ < 10000) {
      const end = k(ring[ring.length - 1]);
      const i = pool.findIndex((l) => k(l[0]) === end || k(l[l.length - 1]) === end);
      if (i < 0) break; // anneau incomplet : on le ferme tel quel
      const next = pool.splice(i, 1)[0];
      ring = ring.concat((k(next[0]) === end ? next : next.slice().reverse()).slice(1));
    }
    if (k(ring[0]) !== k(ring[ring.length - 1])) ring.push(ring[0]);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}
const bigFeatures = big.features.map((f) => {
  const rings = joinRings(f.geometry.coordinates);
  const geometry = rings.length === 1
    ? { type: 'Polygon', coordinates: [rings[0]] }
    : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
  const [labelLon, labelLat] = visualCenter([geometry], rings);
  return { type: 'Feature', properties: { name: f.properties.name, ref: f.properties.ref, labelLon, labelLat }, geometry };
});
writeFileSync('public/streets/grands-quartiers.geojson', JSON.stringify({
  type: 'FeatureCollection',
  attribution: '© OpenStreetMap contributors (ODbL)',
  features: bigFeatures,
}));
console.log(`${bigFeatures.length} grands quartiers (${bigFeatures.filter((f) => f.geometry.type === 'Polygon').length} d'un seul tenant)`);
