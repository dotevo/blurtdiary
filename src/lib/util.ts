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
  return found ?? '';
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
export const renderMd = (body: string): string => DOMPurify.sanitize(marked.parse(body ?? '', { breaks: true, async: false }) as string);
