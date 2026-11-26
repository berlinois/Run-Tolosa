// Génère toutes les icônes (Android, splash, favicon) à partir de design/icon.svg.
// Usage : node scripts/generate-icons.mjs   (nécessite Playwright + Chromium)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const RES = 'android/app/src/main/res';
const BRICK_TOP = '#EEA3A3';
const BRICK_BOTTOM = '#B8505E';

const rounded = readFileSync('design/icon.svg', 'utf8');
const fullBleed = rounded.replace(/rx="112"/, 'rx="0"');
const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** Rendu d'un SVG (viewBox 0 0 W H) en PNG transparent de w×h pixels. */
async function render(page, svg, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`,
  );
  await page.locator('body > svg').screenshot({ path: out, omitBackground: true });
}

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [d, k] of Object.entries(DENSITIES)) {
  // Icônes « legacy » (Android < 8) : carrée arrondie et ronde.
  await render(page, rounded, 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`);
  const round = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath></defs>
    <g clip-path="url(#c)"><g transform="translate(256 256) scale(1.12) translate(-256 -256)">${inner(fullBleed)}</g></g></svg>`;
  await render(page, round, 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`);

  // Icône adaptative (Android 8+) : 108 dp, seule la zone centrale de 72 dp est visible.
  const adaptive = `<svg viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
    <svg x="18" y="18" width="72" height="72" viewBox="0 0 512 512">${inner(fullBleed)}</svg></svg>`;
  await render(page, adaptive, 108 * k, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`);
}

// Écrans de démarrage (Android < 12) : dégradé brique + icône centrée.
const splashSizes = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.38;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRICK_TOP}"/><stop offset="1" stop-color="${BRICK_BOTTOM}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#s)"/>
    <svg x="${(w - s) / 2}" y="${(h - s) / 2}" width="${s}" height="${s}" viewBox="0 0 512 512">${inner(rounded)}</svg></svg>`;
};
for (const [d, [w, h]] of Object.entries(splashSizes)) {
  await render(page, splash(w, h), w, h, `${RES}/drawable-port-${d}/splash.png`);
  await render(page, splash(h, w), h, w, `${RES}/drawable-land-${d}/splash.png`);
}
await render(page, splash(480, 320), 480, 320, `${RES}/drawable/splash.png`);

// Favicon (version navigateur, dev local).
await render(page, rounded, 192, 192, 'public/icon-192.png');
writeFileSync('public/icon.svg', rounded);

await browser.close();
console.log('Icônes générées.');
