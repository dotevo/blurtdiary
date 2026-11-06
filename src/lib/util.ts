import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { lang, t } from './i18n';
import type { Post } from './types';

/** Appends to kids[key], creating the list first. (`kids[key] ||= []` returns the raw array, so the push would not trigger a re-render.) */
export function pushKid(kids: Record<string, Post[]>, key: string, c: Post): void {
  if (!kids[key]) kids[key] = [];
  kids[key].push(c);
}
export const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
/** URL/permlink-safe slug; diacritics are folded first (Podróże -> podroze) instead of turning into dashes. */
export const slug = (s: string): string =>
  s.toLowerCase().replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/đ/g, 'd').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const toDate = (s: string): Date => new Date(s.endsWith('Z') ? s : s + 'Z');
/** "5 minutes ago" / "2 hours ago" / "3 days ago" in the visitor's language; older than a week falls back to the plain date. */
export function fmtAgo(s: string): string {
  const sec = Math.round((Date.now() - toDate(s).getTime()) / 1000);
  if (!isFinite(sec)) return '';
  if (sec > 7 * 86400) return fmtDate(s);
  const rtf = new Intl.RelativeTimeFormat(lang.value, { numeric: 'auto' });
  if (sec < 45) return rtf.format(0, 'second');           // "now"
  if (sec < 3600) return rtf.format(-Math.max(1, Math.round(sec / 60)), 'minute');
  if (sec < 86400) return rtf.format(-Math.round(sec / 3600), 'hour');
  return rtf.format(-Math.round(sec / 86400), 'day');
}
export const fmtDate = (s: string): string => toDate(s).toLocaleDateString(lang.value, { year: 'numeric', month: 'short', day: 'numeric' });

export const meta = (p: Post): Record<string, unknown> => {
  try { return typeof p.json_metadata === 'string' ? JSON.parse(p.json_metadata || '{}') : (p.json_metadata ?? {}); } catch { return {}; }
};
export const tagsOf = (p: Post): string[] => ((meta(p).tags as string[] | undefined) ?? []).map((t) => String(t).toLowerCase());
export const payoutOf = (p: Post): number =>
  p.payout != null ? num(p.payout) : num(p.pending_payout_value) + num(p.total_payout_value) + num(p.curator_payout_value);
export const payoutTitle = (p: Post): string =>
  p.is_paidout ? t('paidTitle', { a: p.author_payout_value ?? '?', c: p.curator_payout_value ?? '?' }) : t('pendingTitle', { v: p.pending_payout_value ?? p.payout ?? '?' });
/** Past the 7-day payout window (or already paid out): the chain no longer accepts votes on it. */
export const isOld = (p: Post): boolean => p.is_paidout === true || Date.now() - toDate(p.created).getTime() > 7 * 24 * 3600 * 1000;
export const votesOf = (p: Post): number => p.stats?.total_votes ?? p.active_votes?.length ?? p.net_votes ?? 0;

export function thumbOf(p: Post): string {
  const m = meta(p); const im = m.image;
  const first = (Array.isArray(im) ? im[0] : im) as string | undefined;
  const found = first ?? (p.body.match(/!\[[^\]]*\]\((https?:[^)\s]+)/) ?? p.body.match(/<img[^>]+src=["'](https?:[^"']+)/))?.[1];
  return safeImg(found);
}
/** Root post of a comment: condenser gives root_author/root_permlink, bridge only `url` (/cat/@rootAuthor/rootPermlink#@author/permlink). */
export function rootOf(c: Post): { author: string; permlink: string } | null {
  if (c.root_author && c.root_permlink) return { author: c.root_author, permlink: c.root_permlink };
  const m = c.url?.match(/@([^/#]+)\/([^/#]+)/);
  return m ? { author: m[1], permlink: m[2] } : null;
}
export const excerpt = (b: string): string =>
  b.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '').replace(/[#>*_`~|-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
/**
 * Markdown/HTML from the chain (posts, comments, the owner's panels) is untrusted: anybody can publish anything, and every blog
 * runs on ONE origin that holds the keys. So this is an ALLOW-LIST, not DOMPurify's permissive default (which keeps <form>,
 * <input>, <style>, `style=`, `class=`, `id=` ...): those would allow a fake "enter your key" form or a full-screen overlay that
 * reuses the app's own CSS classes. Only plain content tags and a few harmless attributes survive; links are https/mailto only.
 */
const MD_TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup', 'mark', 'code', 'pre',
  'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'div', 'span', 'center', 'details', 'summary', 'figure', 'figcaption'];
const MD_ATTRS = ['href', 'src', 'alt', 'title', 'width', 'height', 'align', 'colspan', 'rowspan', 'start', 'open'];
let hooked = false;
function hookOnce(): void {
  if (hooked) return; hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer nofollow ugc'); }
    if (node.tagName === 'IMG') { node.setAttribute('loading', 'lazy'); node.setAttribute('referrerpolicy', 'no-referrer'); }
  });
}
const MENTION = /(^|[^\w@/.-])@([a-z][a-z0-9-]{1,15}(?:\.[a-z0-9-]{1,16})*)(?![\w@-])/g;
/** Turns "@name" in plain text (not inside links, code or preformatted blocks) into a link to that user's blog. Runs AFTER sanitizing. */
function linkMentions(html: string): string {
  if (!html.includes('@')) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue?.includes('@') && !(n.parentElement?.closest('a,code,pre,summary'))) hits.push(n as Text);
  }
  for (const node of hits) {
    const txt = node.nodeValue ?? ''; const frag = doc.createDocumentFragment(); let last = 0;
    for (const m of txt.matchAll(MENTION)) {
      const start = (m.index ?? 0) + m[1].length;
      frag.append(txt.slice(last, start));
      const a = doc.createElement('a'); a.setAttribute('href', `?user=${encodeURIComponent(m[2])}`); a.textContent = `@${m[2]}`;
      frag.append(a); last = start + m[2].length + 1;
    }
    if (!last) continue;
    frag.append(txt.slice(last)); node.replaceWith(frag);
  }
  return doc.body.innerHTML;
}
export const renderMd = (body: string): string => {
  hookOnce();
  return linkMentions(DOMPurify.sanitize(marked.parse(body ?? '', { breaks: true, async: false }) as string, {
    ALLOWED_TAGS: MD_TAGS, ALLOWED_ATTR: MD_ATTRS, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, SANITIZE_NAMED_PROPS: true,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i, // no javascript:, data:, relative or blob: URLs
  }));
};
/** A remote image URL that is safe to drop into CSS `url('…')` and an <img src>: plain https, no quotes/brackets/backslashes. */
export const safeImg = (u?: string): string => { const v = (u ?? '').trim(); return /^https:\/\/[^\s"'()<>\\]+$/i.test(v) ? v : ''; };
