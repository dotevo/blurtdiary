import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

/**
 * Import of posts from an RSS / Atom feed (own WordPress, any other site) into the editor.
 *
 * The feed is read DIRECTLY by the browser – no proxy, nobody in between sees the address or the content. That works when the feed's site
 * sends a CORS header allowing this page (`Access-Control-Allow-Origin`), which the site's owner adds for his own feed. This app's
 * Content-Security-Policy allows connections only to a fixed list of hosts (an XSS must not be able to send keys anywhere), so the feed hosts
 * are listed here AND in `connect-src` of index.html (`npm run check:csp` compares them). Everything that comes back is untrusted: it is
 * parsed as XML (no scripts run), cleaned with DOMPurify, converted to Markdown, and shown through the usual allow-list renderer.
 */
export const RSS_HOSTS: string[] = [];
const MAX_BYTES = 3_000_000, MAX_ITEMS = 30, TIMEOUT_MS = 15000;

export interface FeedItem { title: string; link: string; date: string; html: string; excerpt: string; /** only a summary was in the feed, not the whole article */ partial: boolean; tags: string[] }
export interface Feed { title: string; link: string; items: FeedItem[] }

export const isHttpUrl = (u: string): boolean => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

export class FeedHostError extends Error { constructor(public host: string) { super(host); } }
export const feedOrigin = (url: string): string => { try { return new URL(url).origin; } catch { return ''; } };

async function fetchText(url: string): Promise<string> {
  const origin = feedOrigin(url);
  if (!RSS_HOSTS.includes(origin)) throw new FeedHostError(origin);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    if (txt.length > MAX_BYTES) throw new Error('feed too large');
    return txt;
  } finally { clearTimeout(timer); }
}

const txt = (el: Element | null | undefined): string => (el?.textContent ?? '').trim();
const child = (el: Element, name: string): Element | null => [...el.children].find((c) => c.localName === name) ?? null;
const children = (el: Element, name: string): Element[] => [...el.children].filter((c) => c.localName === name);
const toIso = (s: string): string => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };
const plain = (html: string): string => {
  const b = new DOMParser().parseFromString(html, 'text/html').body;
  b.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return b.textContent?.replace(/\s+/g, ' ').trim() ?? '';
};

export function parseFeed(xml: string): Feed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.querySelector('parsererror')) throw new Error('not a feed');
  const items: FeedItem[] = [];
  if (root.localName === 'feed') { // Atom
    const alt = (e: Element): string => (children(e, 'link').find((l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate') ?? child(e, 'link'))?.getAttribute('href') ?? '';
    for (const e of children(root, 'entry').slice(0, MAX_ITEMS)) {
      const full = txt(child(e, 'content')), sum = txt(child(e, 'summary'));
      items.push({ title: txt(child(e, 'title')), link: alt(e), date: toIso(txt(child(e, 'published')) || txt(child(e, 'updated'))),
        html: full || sum, excerpt: plain(full || sum).slice(0, 200), partial: !full, tags: children(e, 'category').map((c) => c.getAttribute('term') ?? '').filter(Boolean) });
    }
    return { title: txt(child(root, 'title')), link: children(root, 'link').find((l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate')?.getAttribute('href') ?? '', items };
  }
  if (!['rss', 'RDF'].includes(root.localName)) throw new Error('not a feed');
  const ch = root.localName === 'rss' ? child(root, 'channel') : root; // RSS 2.0 (or RDF)
  if (!ch) throw new Error('not a feed');
  for (const e of [...ch.getElementsByTagName('item')].slice(0, MAX_ITEMS)) {
    const full = txt([...e.children].find((c) => c.localName === 'encoded')), sum = txt(child(e, 'description'));
    items.push({ title: txt(child(e, 'title')), link: txt(child(e, 'link')), date: toIso(txt(child(e, 'pubDate')) || txt([...e.children].find((c) => c.localName === 'date'))),
      html: full || sum, excerpt: plain(full || sum).slice(0, 200), partial: !full, tags: children(e, 'category').map((c) => txt(c)).filter(Boolean) });
  }
  return { title: txt(child(ch, 'title')), link: txt(child(ch, 'link')), items };
}

export async function loadFeed(url: string): Promise<Feed> {
  if (!isHttpUrl(url)) throw new Error('bad url');
  return parseFeed(await fetchText(url));
}

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
td.remove(['script', 'style', 'iframe', 'form', 'input', 'button', 'noscript']);

/** Feed HTML -> Markdown. Relative links/images are made absolute against the article, lazy-loaded images are restored, only http(s) survives. */
export function htmlToMarkdown(html: string, base: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const abs = (u: string): string => { try { const x = new URL(u, base || undefined); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
  for (const img of [...doc.querySelectorAll('img')]) {
    const src = abs(img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '');
    if (src) img.setAttribute('src', src); else img.remove();
  }
  for (const a of [...doc.querySelectorAll('a')]) { const h = abs(a.getAttribute('href') || ''); if (h) a.setAttribute('href', h); else a.removeAttribute('href'); }
  const clean = DOMPurify.sanitize(doc.body.innerHTML, { FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'svg', 'math'], FORBID_ATTR: ['style', 'class', 'id', 'srcset'], ALLOW_DATA_ATTR: false });
  return td.turndown(clean).replace(/\n{3,}/g, '\n\n').trim();
}

const esc = (s: string): string => s.replace(/[[\]\\]/g, '\\$&').replace(/\s+/g, ' ').trim();
/** Source line at the end of an imported post (feeds often carry only a summary, so readers need the way to the original). */
export const sourceFooter = (feedTitle: string, link: string, partial: boolean): string =>
  isHttpUrl(link) ? `\n\n---\n<sub>${partial ? 'Excerpt – read the full article at' : 'Originally published at'} [${esc(feedTitle) || new URL(link).host}](${link})</sub>` : '';

/** Feed categories -> tags text (lowercase, a–z0–9 and dashes, max 4). */
export const tagsFrom = (cats: string[]): string =>
  [...new Set(cats.map((c) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)).filter((c) => c.length > 1))].slice(0, 4).join(', ');

/** Same article, whichever way its link is written (www, #fragment, trailing slash, utm_* tracking). */
export const normSource = (u: string): string => {
  try {
    const x = new URL(u); x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/i.test(k)) x.searchParams.delete(k);
    return `${x.host.toLowerCase().replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}`;
  } catch { return u; }
};
const DONE = 'bd-rss-done';
/** What was imported from the feed, remembered in this browser (the chain copy is `json_metadata.rss_source`, see `publishPost`). */
export const importedLocal = (): Record<string, string> => { try { const o = JSON.parse(localStorage.getItem(DONE) ?? '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
export function rememberImported(source: string, permlink: string): void {
  try { const o = importedLocal(); o[normSource(source)] = permlink; const keys = Object.keys(o); if (keys.length > 500) delete o[keys[0]]; localStorage.setItem(DONE, JSON.stringify(o)); } catch { /* ignore */ }
}
