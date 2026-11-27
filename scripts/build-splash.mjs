// Génère public/splash.svg : l'écran d'accueil animé (fond bordeaux, rues de Toulouse,
// Garonne, canal, monuments dessinés au trait, marche dorée calculée sur les vraies rues).
// Usage : node scripts/build-splash.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const streets = JSON.parse(readFileSync('public/streets/toulouse.json', 'utf8'));
const icon = readFileSync('design/icon.svg', 'utf8');

const W = 390, H = 844;
// Cadrage : le cœur de Toulouse, de Saint-Cyprien à la Cité de l'espace.
const CENTER = [1.4555, 43.6005];
const SPAN_LON = 0.074; // largeur visible en degrés de longitude
const k = Math.cos((43.6 * Math.PI) / 180);
const sc = W / (SPAN_LON * k);
const P = (lon, lat) => [W / 2 + (lon - CENTER[0]) * k * sc, H / 2 + 40 - (lat - CENTER[1]) * sc];
const inView = ([x, y]) => x > -40 && x < W + 40 && y > -40 && y < H + 40;
const fmt = (v) => (Math.round(v * 2) / 2).toString();

// ---- Réseau des rues.
const SKIP = new Set(['footway', 'path', 'steps', 'cycleway', 'track', 'bridleway']);
const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link']);
let minor = '', major = '', totalM = 0;
const graph = new Map(); // nœud "lon,lat" → [[voisin, distance], …] (rues carrossables / résidentielles)
const coordOf = new Map();
const addEdge = (a, b, d) => {
  (graph.get(a) ?? graph.set(a, []).get(a)).push([b, d]);
  (graph.get(b) ?? graph.set(b, []).get(b)).push([a, d]);
};
for (const [, , h, len, , flat] of streets.segments) {
  totalM += len;
  const hw = streets.highways[h];
  if (SKIP.has(hw)) continue;
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const xy = pts.map(([lo, la]) => P(lo, la));
  if (xy.some(inView)) {
    const d = 'M' + xy.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L');
    if (MAJOR.has(hw)) major += d; else minor += d;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1].join(','), b = pts[i].join(',');
    coordOf.set(a, pts[i - 1]); coordOf.set(b, pts[i]);
    addEdge(a, b, Math.hypot((pts[i][0] - pts[i - 1][0]) * k, pts[i][1] - pts[i - 1][1]));
  }
}

// ---- Marche : plus court chemin sur les vraies rues, par étapes.
function nearest([lo, la]) {
  let best = null, bd = Infinity;
  for (const [key, [x, y]] of coordOf) {
    const d = ((x - lo) * k) ** 2 + (y - la) ** 2;
    if (d < bd) { bd = d; best = key; }
  }
  return best;
}
function route(from, to) {
  const dist = new Map([[from, 0]]), prev = new Map();
  const heap = [[0, from]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, n] = pop();
    if (n === to) break;
    if (d > (dist.get(n) ?? Infinity)) continue;
    for (const [m, w] of graph.get(n) ?? []) {
      const nd = d + w;
      if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, n); push([nd, m]); }
    }
  }
  const out = [to];
  while (out[0] !== from && prev.has(out[0])) out.unshift(prev.get(out[0]));
  return out.map((key) => coordOf.get(key));
}
// Guilheméry → Grand Rond → Saint-Étienne → Capitole → Saint-Sernin
const stops = [[1.4612, 43.5976], [1.4560, 43.5968], [1.4522, 43.5958], [1.4478, 43.5993], [1.4505, 43.6012], [1.4436, 43.6040], [1.4421, 43.6079]];
let walkPts = [];
for (let i = 1; i < stops.length; i++) {
  const seg = route(nearest(stops[i - 1]), nearest(stops[i]));
  walkPts = walkPts.concat(i === 1 ? seg : seg.slice(1));
}
const walkXY = walkPts.map(([lo, la]) => P(lo, la));
const walk = 'M' + walkXY.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L');
const end = walkXY[walkXY.length - 1];

// ---- Garonne et canal du Midi, stylisés.
const smooth = (pts) => {
  const p = pts.map(([lo, la]) => P(lo, la));
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    d += ` Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return d + ` L${p.at(-1)[0].toFixed(1)} ${p.at(-1)[1].toFixed(1)}`;
};
const garonne = smooth([[1.4285, 43.528], [1.43, 43.547], [1.433, 43.562], [1.4372, 43.576], [1.4405, 43.587], [1.4392, 43.5955], [1.435, 43.6025], [1.43, 43.6085], [1.4225, 43.615], [1.4165, 43.6235], [1.4122, 43.6335], [1.4092, 43.6455], [1.4065, 43.66], [1.404, 43.672]]);
const canal = smooth([[1.429, 43.6155], [1.437, 43.6162], [1.446, 43.614], [1.4528, 43.61], [1.4575, 43.604], [1.4605, 43.598], [1.4612, 43.5915], [1.464, 43.586], [1.472, 43.579], [1.485, 43.569], [1.499, 43.559], [1.515, 43.548]]);

// ---- Monuments dessinés au trait (fins, sans remplissage), centrés en (0, 0), ~34 px.
const ICONS = {
  sernin: `<path d="M-9 0H9M-8 0V-6H8V0M-7-6V-11H7V-6M-6-11V-15.5H6V-11M-5-15.5V-19.5H5V-15.5M-4-19.5V-23H4V-19.5M-2.5-23L0-31L2.5-23"/><path d="M-4-2.5V-3.5M0-2.5V-3.5M4-2.5V-3.5"/>`,
  capitole: `<path d="M-15 0H15M-14-2H14M-13-14L0-21L13-14ZM-13-14H13M-13-12H13"/><path d="M-10-12V-2M-6-12V-2M-2-12V-2M2-12V-2M6-12V-2M10-12V-2"/>`,
  pontneuf: `<path d="M-17-8H17M-17-5H17"/><path d="M-15 2A5 5 0 0 1-5 2M-5 2A5 5 0 0 1 5 2M5 2A5 5 0 0 1 15 2"/><path d="M-15 2V-5M-5 2V-5M5 2V-5M15 2V-5"/><path d="M-10-5.5a1.2 1.2 0 1 0 .01 0M0-5.5a1.2 1.2 0 1 0 .01 0M10-5.5a1.2 1.2 0 1 0 .01 0"/>`,
  grave: `<path d="M-11 0H11M-9 0V-8H9V0M-9-8C-9-17 9-17 9-8M-2-15.5V-19H2V-15.5M0-19V-22"/><path d="M-5-3V-6M0-3V-6M5-3V-6"/>`,
  etienne: `<path d="M-13 0H13M-12 0V-11H1V0M-12-11L-5.5-17L1-11M1 0V-25H9V0M1-19H9M3-25V-28.5H7V-25M5-28.5V-31"/><path d="M-5.5-6.5a2.6 2.6 0 1 0 .01 0M-9 0V-3M-2 0V-3M5 0V-4"/>`,
};
const MONUMENTS = [
  ['grave', 1.4335, 43.5995, 'La Grave'],
  ['pontneuf', 1.4395, 43.5997, 'Pont-Neuf'],
  ['capitole', 1.4436, 43.6045, 'Capitole'],
  ['etienne', 1.4513, 43.6000, 'Saint-Étienne'],
  ['sernin', 1.4421, 43.6083, 'Saint-Sernin'],
];
// Décalages légers pour aérer le centre-ville (les icônes restent sur leur quartier).
const NUDGE = { grave: [-16, 10], pontneuf: [-4, 30], capitole: [30, 2], etienne: [18, -6], sernin: [0, -8] };
let mon = '';
MONUMENTS.forEach(([id, lo, la, name], i) => {
  const [x, y] = P(lo, la);
  const [dx, dy] = NUDGE[id];
  mon += `<g class="mon" style="animation-delay:${(0.6 + i * 0.3).toFixed(2)}s" transform="translate(${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)})">` +
    `<g class="ico" transform="scale(1.35)">${ICONS[id]}</g><text y="16">${name.toUpperCase()}</text></g>`;
});

const logo = icon.replace('<svg ', `<svg x="${W / 2 - 24}" y="64" width="48" height="48" `);
const km = Math.round(totalM / 1000).toLocaleString('fr-FR').replace(/ | /g, ' ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
  <radialGradient id="gc" cx=".5" cy=".5" r=".8"><stop offset="0" stop-color="#B84D62"/><stop offset="1" stop-color="#6E2333"/></radialGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6E2333" stop-opacity=".95"/><stop offset=".2" stop-color="#6E2333" stop-opacity="0"/>
    <stop offset=".85" stop-color="#6E2333" stop-opacity="0"/><stop offset="1" stop-color="#6E2333" stop-opacity=".95"/>
  </linearGradient>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <style>
    text { font-family: system-ui, -apple-system, sans-serif; }
    .net { animation: fade 1.4s ease-out both; }
    .walk, .walk-glow { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 2.4s .4s cubic-bezier(.45,.05,.35,1) forwards; }
    .mon { opacity: 0; animation: fade .7s ease-out both; }
    .ico { fill: none; stroke: #F7C64F; stroke-width: .85; stroke-linecap: round; stroke-linejoin: round; }
    .mon text { fill: #FFE9A8; font-size: 7.5px; font-weight: 500; letter-spacing: .14em; text-anchor: middle; opacity: .85; }
    .dot { opacity: 0; animation: fade .3s 2.8s forwards; }
    .pulse { opacity: 0; transform-box: fill-box; transform-origin: center; animation: pulse 1.6s 2.8s ease-out infinite; }
    .title { animation: fade 1s ease-out both; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pulse { 0% { opacity: .8; transform: scale(1); } 100% { opacity: 0; transform: scale(3.2); } }
  </style>
</defs>
<rect width="${W}" height="${H}" fill="url(#gc)"/>
<g class="net" fill="none" stroke-linecap="round">
  <path d="${minor}" stroke="#FFD6DF" stroke-opacity=".2" stroke-width=".5"/>
  <path d="${major}" stroke="#FFE3E9" stroke-opacity=".42" stroke-width=".9"/>
  <path d="${canal}" stroke="#BFE6F7" stroke-opacity=".75" stroke-width="1.6"/>
  <path d="${garonne}" stroke="#8FD3F0" stroke-opacity=".9" stroke-width="5"/>
</g>
<path class="walk-glow" pathLength="1" d="${walk}" stroke="#F7C64F" stroke-opacity=".55" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
<path class="walk" pathLength="1" d="${walk}" stroke="#FFD66B" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<circle class="pulse" cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="3" fill="none" stroke="#FFD66B" stroke-width="1"/>
<circle class="dot" cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="2.6" fill="#FFD66B"/>
${mon}
<rect width="${W}" height="${H}" fill="url(#fade)"/>
<g class="title">
  ${logo}
  <text x="${W / 2}" y="146" font-size="22" font-weight="600" fill="#fff" text-anchor="middle" letter-spacing="6">RUN TOLOSA</text>
  <text x="${W / 2}" y="792" font-size="11" font-weight="400" fill="#FFE3E9" text-anchor="middle" letter-spacing="2">${km.toUpperCase()} KM DE RUES À PARCOURIR</text>
</g>
</svg>
`;
writeFileSync('public/splash.svg', svg);
console.log(`public/splash.svg : ${(svg.length / 1024).toFixed(0)} Ko, marche ${walkPts.length} points`);
