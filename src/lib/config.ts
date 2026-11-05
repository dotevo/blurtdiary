/**
 * Blog settings live in an ordinary, human-readable post: @<user>/blurt-diary-config
 * (found by its fixed permlink – no profile change needed, so the posting key is enough to edit it).
 *
 *   title: My blog
 *   accent: #e4572e
 *   ...
 *   links:
 *   - GitHub | https://github.com/me
 *   categories:
 *   - Travel | travel, trips | Journeys
 *   chains:
 *   - hive | my-hive-name
 *   - steem | my-steem-name
 *
 * The legacy format ("# title: …" and "> Name | tags | desc") is still understood.
 */
import { CHAIN_IDS, PRIMARY } from './chains';
import { slug } from './util';
import type { BlogCategory, BlogConfig, PanelCfg } from './types';

export const CONFIG_PERMLINK = 'blurt-diary-config';
export const BUILTIN_PANELS = ['about', 'payouts', 'comments', 'categories'];
export const DEFAULT_PANELS: PanelCfg[] = [{ id: 'about' }, { id: 'payouts' }, { id: 'comments' }];
export const MAX_CUSTOM_PANELS = 6;
/**
 * Extra appearance options. The FIRST value of each list is the default and means "exactly the look the blog always had", so a blog
 * that never touches these keeps its look, and default values are never written to the config post. An unknown key or value is ignored.
 * CSS lives in style.css under [data-ui-<key>=<value>]; there is deliberately NO free-form CSS option (the config comes from the chain).
 */
export const UI_OPTIONS: Record<string, string[]> = {
  radius: ['soft', 'sharp', 'round'],
  cards: ['shadow', 'flat', 'lifted'],
  density: ['normal', 'compact', 'airy'],
  width: ['normal', 'narrow', 'wide'],
  columns: ['auto', '2', '3', '4'],
  hero: ['normal', 'compact', 'tall'],
  'text-size': ['normal', 'small', 'large'],
  headings: ['inherit', 'serif', 'sans', 'mono'],
  thumbs: ['show', 'hide'],
  rewards: ['show', 'hide'],
};
export const emptyConfig = (): BlogConfig => ({ cats: [], links: [] });

/** Only plain https URLs without characters that could break out of CSS url() or attributes. */
export const safeUrl = (u?: string): string => { const v = (u ?? '').trim(); return /^https:\/\/[^\s"'()<>\\]+$/i.test(v) ? v : ''; };
export const normHex = (v?: string): string => {
  const m = (v ?? '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '';
  let h = m[1].toLowerCase(); if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return '#' + h;
};
export const parseTags = (s: string): string[] =>
  [...new Set(s.split(/[\s,]+/).map((x) => x.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean))];

/** Account names are 3-16 chars on every supported chain: lowercase letters, digits, dots and dashes, starting with a letter. */
export const normAccount = (v?: string): string => { const a = (v ?? '').trim().toLowerCase().replace(/^@/, ''); return /^[a-z][a-z0-9.-]{2,15}$/.test(a) ? a : ''; };

const clip = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n);
function setKey(cfg: BlogConfig, key: string, v: string): void {
  switch (key) {
    case 'title': cfg.title = clip(v, 80) || undefined; break;
    case 'subtitle': cfg.subtitle = clip(v, 160) || undefined; break;
    case 'about': cfg.about = clip(v, 600) || undefined; break;
    case 'footer': cfg.footer = clip(v, 200) || undefined; break;
    case 'cover': cfg.cover = safeUrl(v) || undefined; break;
    case 'logo': cfg.logo = safeUrl(v) || undefined; break;
    case 'language': cfg.language = v.trim().toLowerCase() || undefined; break;
    case 'palette': cfg.palette = v.trim().toLowerCase() || undefined; break;
    case 'accent': cfg.accent = normHex(v) || undefined; break;
    case 'accent-dark': cfg.accentDark = normHex(v) || undefined; break;
    case 'bg': cfg.bg = normHex(v) || undefined; break;
    case 'bg-dark': cfg.bgDark = normHex(v) || undefined; break;
    case 'font': if (['sans', 'serif', 'mono'].includes(v.trim())) cfg.font = v.trim() as BlogConfig['font']; break;
    case 'layout': if (['grid', 'list'].includes(v.trim())) cfg.layout = v.trim() as BlogConfig['layout']; break;
    case 'sidebar': if (['right', 'left', 'none'].includes(v.trim())) cfg.sidebar = v.trim() as BlogConfig['sidebar']; break;
    case 'panels': if (v.trim().toLowerCase() === 'none') cfg.panels = []; break; // "panels: none" = no sidebar panels at all
    default: { // extra appearance options; only a known value that is not the default is kept
      const list = UI_OPTIONS[key], val = v.trim().toLowerCase();
      if (list && list.includes(val) && val !== list[0]) (cfg.ui ??= {})[key] = val;
    }
  }
}
function addCat(cfg: BlogConfig, s: string): void {
  const [name, tags = '', ...rest] = s.split('|').map((x) => x.trim());
  if (!name) return;
  let id = slug(name) || 'cat'; let n = 2;
  while (cfg.cats.some((c) => c.id === id)) id = `${slug(name) || 'cat'}-${n++}`;
  cfg.cats.push({ id, name: clip(name, 40), desc: clip(rest.join('|'), 120), tags: parseTags(tags) });
}
function addPanel(cfg: BlogConfig, s: string): void {
  const list = (cfg.panels ??= []);
  const i = s.indexOf('|');
  if (i < 0) { // a built-in panel, each at most once
    const id = s.trim().toLowerCase();
    if (BUILTIN_PANELS.includes(id) && !list.some((p) => p.id === id)) list.push({ id });
    return;
  }
  const title = clip(s.slice(0, i), 40), text = clip(s.slice(i + 1), 500); // custom panel: "Title | single-line Markdown"
  if ((title || text) && list.filter((p) => p.id === 'custom').length < MAX_CUSTOM_PANELS) list.push({ id: 'custom', title, text });
}
/** "hive | account": the owner's account on another chain (Blurt is implied by ?user=). */
function addChain(cfg: BlogConfig, s: string): void {
  const i = s.indexOf('|'); if (i < 0) return;
  const id = s.slice(0, i).trim().toLowerCase(), acc = normAccount(s.slice(i + 1));
  if (id !== PRIMARY && CHAIN_IDS.includes(id as never) && acc) (cfg.accounts ??= {})[id] = acc;
}
function addLink(cfg: BlogConfig, s: string): void {
  const i = s.indexOf('|'); if (i < 0) return;
  const label = clip(s.slice(0, i), 40), url = safeUrl(s.slice(i + 1));
  if (label && url) cfg.links.push({ label, url });
}

export function parseConfig(text: string): BlogConfig {
  const cfg = emptyConfig();
  let section: '' | 'links' | 'categories' | 'panels' | 'chains' = '';
  let legacyWidgets: string[] | undefined; // old "widgets: about, comments" line
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^#\s*(title|subtitle|accent|cover)\s*:\s*(.+)$/i))) { setKey(cfg, m[1].toLowerCase(), m[2]); continue; } // legacy
    if (l.startsWith('#')) continue;                                                                                           // headings
    if (l.startsWith('>')) { addCat(cfg, l.slice(1)); continue; }                                                              // legacy category
    if ((m = l.match(/^(links|categories|panels|chains)\s*:\s*$/i))) { section = m[1].toLowerCase() as typeof section; continue; }
    if (section && (m = l.match(/^[-*]\s+(.*)$/))) { if (section === 'links') addLink(cfg, m[1]); else if (section === 'panels') addPanel(cfg, m[1]); else if (section === 'chains') addChain(cfg, m[1]); else addCat(cfg, m[1]); continue; }
    if ((m = l.match(/^([a-z-]+)\s*:\s*(.*)$/i))) {
      section = '';
      if (m[1].toLowerCase() === 'widgets') legacyWidgets = m[2].split(',').map((x) => x.trim().toLowerCase()).filter((x) => BUILTIN_PANELS.includes(x));
      else setKey(cfg, m[1].toLowerCase(), m[2]);
    }
  }
  if (!cfg.panels && legacyWidgets) cfg.panels = legacyWidgets.map((id) => ({ id }));
  return cfg;
}

export function serializeConfig(cfg: BlogConfig): string {
  const kv = (k: string, v?: string): string[] => (v ? [`${k}: ${v.replace(/\s*\n\s*/g, ' ').trim()}  `] : []);
  const cats = cfg.cats.filter((c: BlogCategory) => c.name.trim());
  return [
    '# Blurt Diary - settings', '',
    'This post stores the settings of the blog. Edit it in the Blurt Diary configurator or by hand - keep the "key: value" lines.', '',
    ...kv('title', cfg.title), ...kv('subtitle', cfg.subtitle), ...kv('about', cfg.about), ...kv('cover', cfg.cover), ...kv('logo', cfg.logo),
    ...kv('language', cfg.language), ...kv('footer', cfg.footer), '',
    ...kv('palette', cfg.palette), ...kv('accent', cfg.accent), ...kv('accent-dark', cfg.accentDark), ...kv('bg', cfg.bg), ...kv('bg-dark', cfg.bgDark),
    ...kv('font', cfg.font), ...kv('layout', cfg.layout), ...kv('sidebar', cfg.sidebar),
    ...Object.keys(UI_OPTIONS).flatMap((k) => kv(k, cfg.ui?.[k] && UI_OPTIONS[k].includes(cfg.ui[k]) && cfg.ui[k] !== UI_OPTIONS[k][0] ? cfg.ui[k] : undefined)), '',
    ...(cfg.panels?.length === 0 ? ['panels: none  ', ''] : []),
    ...(cfg.panels?.length ? ['panels:', ...cfg.panels.map((p) => (p.id === 'custom' ? `- ${(p.title ?? '').replace(/[|\n]/g, ' ').trim()} | ${(p.text ?? '').replace(/\s*\n\s*/g, ' ').trim()}` : `- ${p.id}`)), ''] : []),
    ...(Object.keys(cfg.accounts ?? {}).length ? ['chains:', ...Object.entries(cfg.accounts ?? {}).filter(([, a]) => normAccount(a)).map(([c, a]) => `- ${c} | ${normAccount(a)}`), ''] : []),
    ...(cfg.links.length ? ['links:', ...cfg.links.map((l) => `- ${l.label} | ${l.url}`), ''] : []),
    ...(cats.length ? ['categories:', ...cats.map((c) => `- ${c.name} | ${c.tags.join(', ')}${c.desc ? ' | ' + c.desc : ''}`), ''] : []),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
