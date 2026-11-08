import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

/**
 * Import of posts from an RSS / Atom feed (own WordPress, any other site) into the editor.
 *
 * The feed is read directly by the browser, with no proxy: a hidden sandboxed iframe (public/feed-frame.html – an opaque origin without access to
 * this app's storage or keys, its own CSP allows connections to https hosts) does a plain GET and hands back TEXT. The page itself keeps its strict
 * connect-src. The feed's site must allow the read with a CORS header (`Access-Control-Allow-Origin`) – a browser rule no code can bypass.
 * Everything that comes back is untrusted: parsed as XML (no scripts run), cleaned with DOMPurify, converted to Markdown and shown through the usual
 * allow-list renderer.
 */
const MAX_BYTES = 3_000_000, MAX_ITEMS = 30, TIMEOUT_MS = 15000;

export interface FeedItem { title: string; link: string; date: string; html: string; excerpt: string; /** only a summary was in the feed, not the whole article */ partial: boolean; tags: string[] }
export interface Feed { title: string; link: string; items: FeedItem[] }

export const isHttpUrl = (u: string): boolean => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

/** Why a feed could not be read: `network` is what the browser reports for a refused CORS check, an unreachable site or a bad certificate. */
export class FeedFetchError extends Error { constructor(public kind: string, public status = 0) { super(kind === 'http' ? `HTTP ${status}` : kind); } }

let frame: Promise<HTMLIFrameElement> | null = null;
function getFrame(): Promise<HTMLIFrameElement> {
  return (frame ??= new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts'); // no allow-same-origin: opaque origin, nothing of this app is reachable from inside
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.style.cssText = 'display:none';
    f.src = new URL('feed-frame.html', document.baseURI).href;
    const onMsg = (e: MessageEvent): void => { if (e.source === f.contentWindow && e.data?.ready) { window.removeEventListener('message', onMsg); resolve(f); } };
    window.addEventListener('message', onMsg);
    setTimeout(() => { window.removeEventListener('message', onMsg); frame = null; f.remove(); reject(new FeedFetchError('timeout')); }, TIMEOUT_MS);
    document.body.appendChild(f);
  }));
}

async function fetchText(url: string): Promise<string> {
  const f = await getFrame();
  const id = Math.random().toString(36).slice(2);
  return new Promise<string>((resolve, reject) => {
    const done = (fn: () => void): void => { window.removeEventListener('message', onMsg); clearTimeout(timer); fn(); };
    const onMsg = (e: MessageEvent): void => {
      if (e.source !== f.contentWindow || e.data?.id !== id) return;
      const d = e.data as { text?: unknown; error?: string; status?: number };
      if (typeof d.text === 'string') done(() => (d.text as string).length > MAX_BYTES ? reject(new FeedFetchError('too-large')) : resolve(d.text as string)); else done(() => reject(new FeedFetchError(String(d.error ?? 'network'), d.status ?? 0)));
    };
    const timer = setTimeout(() => done(() => reject(new FeedFetchError('timeout'))), TIMEOUT_MS + 2000);
    window.addEventListener('message', onMsg);
    f.contentWindow?.postMessage({ id, url }, '*');
  });
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
