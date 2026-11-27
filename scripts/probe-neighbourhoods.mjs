// Sonde : quels découpages plus fins que les 20 quartiers existent dans OSM pour Toulouse ?
// Usage : node scripts/probe-neighbourhoods.mjs  (affiche un résumé, n'écrit rien)
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = { 'User-Agent': 'run-tolosa-street-extractor/1.0 (personal, non-commercial)', Accept: 'application/json' };
const QUERY = `
[out:json][timeout:300];
area["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"="31555"]->.t;
(
  nwr(area.t)["place"~"^(suburb|quarter|neighbourhood)$"];
  rel(area.t)["boundary"~"^(administrative|place|neighbourhood)$"]["admin_level"~"^(9|10|11|12)$"];
);
out tags center;
`;
let osm;
for (let i = 1; i <= 4; i++) {
  try {
    const r = await fetch(OVERPASS, { method: 'POST', headers: UA, body: new URLSearchParams({ data: QUERY }) });
    if (r.ok) { osm = await r.json(); break; }
    console.warn('HTTP', r.status);
  } catch (e) { console.warn('réseau', e.cause?.code ?? e.message); }
  await new Promise((r) => setTimeout(r, 30000 * i));
}
if (!osm) throw new Error('Overpass indisponible');
const groups = {};
for (const e of osm.elements) {
  const t = e.tags ?? {};
  const kind = `${e.type === 'node' ? 'point' : 'polygone'} · ${t.place ? `place=${t.place}` : `boundary=${t.boundary} admin_level=${t.admin_level}`}`;
  (groups[kind] ??= []).push(t.name ?? '(sans nom)');
}
for (const [k, names] of Object.entries(groups).sort()) {
  console.log(`\n== ${k} : ${names.length}`);
  console.log(names.sort((a, b) => a.localeCompare(b, 'fr')).join(' | '));
}
