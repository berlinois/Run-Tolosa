// Génère public/splash.svg : l'écran d'accueil animé (fond bordeaux, toutes les rues
// de Toulouse, Garonne, canal, monuments dorés, marche dorée qui se dessine).
// Usage : node scripts/build-splash.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const streets = JSON.parse(readFileSync('public/streets/toulouse.json', 'utf8'));
const big = JSON.parse(readFileSync('public/streets/grands-quartiers.geojson', 'utf8'));
const icon = readFileSync('design/icon.svg', 'utf8');

const W = 390, H = 844;
const [lon0, lon1, lat1] = [1.345, 1.522, 43.672];
const k = Math.cos((43.6 * Math.PI) / 180);
const sc = (W - 30) / ((lon1 - lon0) * k);
const ox = 15, oy = 200;
const P = (lon, lat) => [ox + (lon - lon0) * k * sc, oy + (lat1 - lat) * sc];
const r1 = (v) => Math.round(v * 2) / 2; // demi-pixel : fichier plus léger
const path = (coords) => 'M' + coords.map(([lo, la]) => P(lo, la).map(r1).join(' ')).join('L');
const smooth = (pts) => {
  const p = pts.map(([lo, la]) => P(lo, la));
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    d += ` Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = p[p.length - 1];
  return d + ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
};

// Réseau des rues (hors chemins piétons) et grands axes.
const SKIP = new Set(['footway', 'path', 'steps', 'cycleway', 'track', 'bridleway']);
const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link']);
let all = '', major = '', totalM = 0;
for (const [, , h, len, , flat] of streets.segments) {
  totalM += len;
  const hw = streets.highways[h];
  if (SKIP.has(hw)) continue;
  const coords = [];
  for (let i = 0; i < flat.length; i += 2) coords.push([flat[i], flat[i + 1]]);
  const d = path(coords);
  if (MAJOR.has(hw)) major += d; else all += d;
}

// Garonne et canal du Midi, stylisés.
const garonne = smooth([[1.4285, 43.528], [1.43, 43.547], [1.433, 43.562], [1.4372, 43.576], [1.4405, 43.587], [1.4392, 43.5955], [1.435, 43.6025], [1.43, 43.6085], [1.4225, 43.615], [1.4165, 43.6235], [1.4122, 43.6335], [1.4092, 43.6455], [1.4065, 43.66], [1.404, 43.672]]);
const canal = smooth([[1.429, 43.6155], [1.437, 43.6162], [1.446, 43.614], [1.4528, 43.61], [1.4575, 43.604], [1.4605, 43.598], [1.4612, 43.5915], [1.464, 43.586], [1.472, 43.579], [1.485, 43.569], [1.499, 43.559], [1.515, 43.548]]);
// Marche dorée : de Guilheméry jusqu'à Saint-Sernin.
const walk = smooth([[1.4635, 43.5958], [1.4615, 43.5985], [1.458, 43.601], [1.452, 43.6035], [1.447, 43.606], [1.444, 43.608], [1.4425, 43.6083]]);

// Monuments (icônes simples), à leur position réelle, écartés au centre-ville.
const sernin = (x, y, s) => {
  let o = '';
  for (const [dy, w, hh] of [[0, 1, 0.36], [-0.36, 0.86, 0.3], [-0.66, 0.72, 0.27], [-0.93, 0.58, 0.24], [-1.17, 0.44, 0.21]]) {
    o += `<rect x="${(x - (w * s) / 2).toFixed(1)}" y="${(y + (dy - hh) * s).toFixed(1)}" width="${(w * s).toFixed(1)}" height="${(hh * s).toFixed(1)}" rx="1"/>`;
  }
  const top = y - 1.38 * s;
  return o + `<polygon points="${x - 0.24 * s},${top} ${x + 0.24 * s},${top} ${x},${top - 0.62 * s}"/>`;
};
const capitole = (x, y, s) => {
  let o = `<polygon points="${x - s},${y - 1.05 * s} ${x + s},${y - 1.05 * s} ${x},${y - 1.45 * s}"/><rect x="${x - s}" y="${y - 1.02 * s}" width="${2 * s}" height="${0.14 * s}"/>`;
  for (let i = 0; i < 6; i++) o += `<rect x="${x - s + 0.12 * s + i * 0.33 * s}" y="${y - 0.85 * s}" width="${0.13 * s}" height="${0.72 * s}"/>`;
  return o + `<rect x="${x - 1.1 * s}" y="${y - 0.13 * s}" width="${2.2 * s}" height="${0.15 * s}"/>`;
};
const pontneuf = (x, y, s) => {
  let o = `<rect x="${x - 1.4 * s}" y="${y - 0.62 * s}" width="${2.8 * s}" height="${0.62 * s}" rx="2"/>`;
  for (const i of [-0.9, 0, 0.9]) o += `<path class="hole" d="M${x + (i - 0.36) * s} ${y} v${-0.18 * s} a${0.36 * s} ${0.36 * s} 0 0 1 ${0.72 * s} 0 v${0.18 * s} z"/>`;
  return o;
};
const grave = (x, y, s) =>
  `<rect x="${x - 0.75 * s}" y="${y - 0.5 * s}" width="${1.5 * s}" height="${0.5 * s}"/>` +
  `<path d="M${x - 0.62 * s} ${y - 0.5 * s} a${0.62 * s} ${0.72 * s} 0 0 1 ${1.24 * s} 0 z"/>` +
  `<rect x="${x - 0.07 * s}" y="${y - 1.42 * s}" width="${0.14 * s}" height="${0.24 * s}"/>`;
const fusee = (x, y, s) =>
  `<path d="M${x} ${y - 1.6 * s} q${0.32 * s} ${0.35 * s} ${0.3 * s} ${0.9 * s} v${0.55 * s} h${-0.6 * s} v${-0.55 * s} q${-0.02 * s} ${-0.55 * s} ${0.3 * s} ${-0.9 * s} z"/>` +
  `<path d="M${x - 0.3 * s} ${y - 0.4 * s} l${-0.28 * s} ${0.4 * s} h${0.28 * s} z M${x + 0.3 * s} ${y - 0.4 * s} l${0.28 * s} ${0.4 * s} h${-0.28 * s} z"/>`;
const monuments = [
  [grave, 1.4335, 43.5995, 'La Grave', 13, [-56, 4]],
  [pontneuf, 1.4395, 43.5997, 'Pont-Neuf', 11, [8, 46]],
  [capitole, 1.4436, 43.6045, 'Capitole', 13, [58, -8]],
  [fusee, 1.494, 43.5864, "Cité de l'espace", 15, [0, 0]],
  [sernin, 1.4421, 43.6083, 'Saint-Sernin', 14, [0, -40]],
];
let mon = '';
monuments.forEach(([f, lo, la, name, s, [dx, dy]], i) => {
  const [x, y] = P(lo, la);
  const [X, Y] = [x + dx, y + dy];
  const lead = dx || dy ? `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${X.toFixed(1)}" y2="${(Y - 3).toFixed(1)}" class="lead"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4"/>` : '';
  mon += `<g class="mon" style="animation-delay:${(0.5 + i * 0.35).toFixed(2)}s">${lead}<g filter="url(#sh)">${f(X, Y, s)}</g><text x="${X.toFixed(1)}" y="${(Y + 13).toFixed(1)}">${name}</text></g>`;
});

const logo = icon.replace('<svg ', `<svg x="163" y="60" width="64" height="64" `);
const km = Math.round(totalM / 1000).toLocaleString('fr-FR').replace(/ | /g, ' ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
  <radialGradient id="gc" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#C9586D"/><stop offset="1" stop-color="#7E2A3B"/></radialGradient>
  <filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity=".35"/></filter>
  <style>
    text { font-family: system-ui, sans-serif; }
    .net { animation: fade 1.2s ease-out both; }
    .walk { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 2.6s .35s ease-in-out forwards; }
    .mon { fill: #F7C64F; opacity: 0; transform-box: fill-box; animation: pop .5s ease-out both; }
    .mon .hole { fill: #9A3448; }
    .mon .lead { stroke: #F7C64F; stroke-opacity: .7; stroke-width: 1.2; }
    .mon text { fill: #FFE9A8; font-size: 9.5px; font-weight: 700; text-anchor: middle; }
    .title { animation: fade .8s ease-out both; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  </style>
</defs>
<rect width="${W}" height="${H}" fill="url(#gc)"/>
<g class="net">
  <path d="${all}" stroke="#FFD6DF" stroke-opacity=".28" stroke-width=".45" fill="none"/>
  <path d="${major}" stroke="#FFE3E9" stroke-opacity=".55" stroke-width=".9" fill="none"/>
  <path d="${canal}" stroke="#BFE6F7" stroke-opacity=".9" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="${garonne}" stroke="#8FD3F0" stroke-width="7" fill="none" stroke-linecap="round"/>
</g>
<path class="walk" pathLength="1" d="${walk}" stroke="#F7C64F" stroke-width="3.5" fill="none" stroke-linecap="round"/>
${mon}
<g class="title">
  ${logo}
  <text x="${W / 2}" y="158" font-size="28" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="1">RUN TOLOSA</text>
  <text x="${W / 2}" y="780" font-size="13" fill="#FFE3E9" text-anchor="middle">${km} km de rues à parcourir</text>
</g>
</svg>
`;
writeFileSync('public/splash.svg', svg);
console.log(`public/splash.svg : ${(svg.length / 1024).toFixed(0)} Ko, ${km} km`);
