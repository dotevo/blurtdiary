// Builds every raster/vector icon from the SVG sources in icons-src/ (run automatically before `dev` and `build`).
//   icons-src/icon.svg  -> public/favicon.svg, public/icons/{apple-touch-icon,icon-192,icon-512,maskable-512}.png
//   icons-src/logo.svg  -> public/logo.svg (the big logo for pages without a blog)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const BG = '<rect width="256" height="256" fill="#17181c"/>';
const icon = readFileSync('icons-src/icon.svg', 'utf8');
if (!icon.includes(BG)) throw new Error('icons-src/icon.svg: the background <rect> was not found');
mkdirSync('public/icons', { recursive: true });

/** Tab icon: rounded corners (the PNGs below stay square: the platform rounds/masks them itself). */
writeFileSync('public/favicon.svg', icon.replace(BG, '<rect width="256" height="256" rx="56" fill="#17181c"/>'));
writeFileSync('public/logo.svg', readFileSync('icons-src/logo.svg'));

const png = (svg, size, file) => writeFileSync(`public/icons/${file}`, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
png(icon, 180, 'apple-touch-icon.png');
png(icon, 192, 'icon-192.png');
png(icon, 512, 'icon-512.png');
// maskable: the artwork must stay inside the central 80% circle, so it is shrunk onto a full-bleed background
const inner = icon.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(BG, '');
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${BG}<g transform="translate(23.04 23.04) scale(.82)">${inner}</g></svg>`, 512, 'maskable-512.png');
console.log('icons: built from icons-src/');
