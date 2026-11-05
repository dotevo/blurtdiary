import { normHex, UI_OPTIONS } from './config';
import type { BlogConfig } from './types';

interface Vars { bg: string; card: string; text: string; mute: string; line: string; accent: string }
export const PALETTES: Record<string, { light: Vars; dark: Vars }> = {
  default: { light: { bg: '#f6f5f2', card: '#ffffff', text: '#1f2328', mute: '#6b7280', line: '#e5e2db', accent: '#e4572e' }, dark: { bg: '#121316', card: '#1b1d22', text: '#e8e9ec', mute: '#9aa0aa', line: '#2b2e35', accent: '#e4572e' } },
  paper:   { light: { bg: '#f4ecd8', card: '#fbf5e6', text: '#3b2f1e', mute: '#7a6a50', line: '#e0d3b5', accent: '#a4562a' }, dark: { bg: '#1c1812', card: '#262017', text: '#eadfc8', mute: '#a89878', line: '#3a3125', accent: '#d98a52' } },
  ocean:   { light: { bg: '#eef4f8', card: '#ffffff', text: '#17303f', mute: '#5d7a8c', line: '#d5e3ec', accent: '#0a74b9' }, dark: { bg: '#0e1a22', card: '#14242e', text: '#dce9f1', mute: '#8fa9b9', line: '#223845', accent: '#4aa8e0' } },
  forest:  { light: { bg: '#f0f4ee', card: '#ffffff', text: '#1d2b1f', mute: '#5f7262', line: '#d9e3d6', accent: '#2f7d4a' }, dark: { bg: '#0f1712', card: '#16221a', text: '#dfeadf', mute: '#8fa592', line: '#243428', accent: '#5ec17f' } },
  rose:    { light: { bg: '#faf1f3', card: '#ffffff', text: '#35202a', mute: '#86606d', line: '#f0dce1', accent: '#c2335f' }, dark: { bg: '#1a1015', card: '#25171e', text: '#f2dfe5', mute: '#b496a1', line: '#3a2530', accent: '#ef6f95' } },
  graphite:{ light: { bg: '#ececec', card: '#ffffff', text: '#1a1a1a', mute: '#666666', line: '#d8d8d8', accent: '#333333' }, dark: { bg: '#0c0c0c', card: '#161616', text: '#eeeeee', mute: '#999999', line: '#2a2a2a', accent: '#cfcfcf' } },
};
const FONTS = {
  sans: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
  serif: "Georgia,'Iowan Old Style','Times New Roman',serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
};
const fgFor = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
};
const decl = (v: Vars): string => `--bg:${v.bg};--card:${v.card};--text:${v.text};--mute:${v.mute};--line:${v.line};--accent:${v.accent};--accent-fg:${fgFor(v.accent)}`;

/** Applies the blog's colours/font/layout. Colours are validated hex values only (the config comes from the chain). */
export function applyTheme(cfg: BlogConfig): void {
  const p = Object.prototype.hasOwnProperty.call(PALETTES, cfg.palette ?? '') ? PALETTES[cfg.palette!] : PALETTES.default; // hasOwn: 'constructor', '__proto__' ... are not palettes
  const light: Vars = { ...p.light, accent: normHex(cfg.accent) || p.light.accent, bg: normHex(cfg.bg) || p.light.bg };
  const dark: Vars = { ...p.dark, accent: normHex(cfg.accentDark) || normHex(cfg.accent) || p.dark.accent, bg: normHex(cfg.bgDark) || p.dark.bg };
  let el = document.getElementById('diary-theme') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'diary-theme'; document.head.append(el); }
  el.textContent = `:root{${decl(light)};--font:${FONTS[cfg.font ?? 'sans']}}@media(prefers-color-scheme:dark){:root{${decl(dark)}}}`;
  document.documentElement.dataset.layout = cfg.layout ?? 'grid';
  // extra options: one attribute per non-default value (data-ui-radius="sharp" ...); CSS in style.css. Default = no attribute = the classic look.
  for (const k of Object.keys(UI_OPTIONS)) {
    const v = cfg.ui?.[k];
    if (v && UI_OPTIONS[k].includes(v) && v !== UI_OPTIONS[k][0]) document.documentElement.setAttribute(`data-ui-${k}`, v); else document.documentElement.removeAttribute(`data-ui-${k}`);
  }
}
