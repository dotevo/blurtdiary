/**
 * "World" listings for logged-in users – the feed of the accounts you follow and the posts of a tag, taken from SEVERAL chains and merged.
 * (The blog itself stays Blurt-only; this is the private reading side that lives behind the top bar.)
 *
 * How a chain lists things is the chain adapter's business (`feedPosts`, `tagPosts`); here the pages of every chain are merged:
 * the same post on several chains (same author + permlink = a mirror) becomes ONE item with several chain badges.
 */
import { reactive, watch } from 'vue';
import { auth, loggedChains } from './auth';
import { adapter, CHAINS } from './chains';
import type { Cursor, Sort } from './chains/posts';
import type { Post } from './types';
import { toDate } from './util';

export interface WItem { key: string; lead: Post; copies: Record<string, Post>; chains: string[]; at: number; sc?: Record<string, number> }
interface Src { more: boolean; cursor?: Cursor; error: string; oldest: number; n?: number }
export interface WList { items: WItem[]; loading: boolean; sources: Record<string, Src>; for: string }

const keyOf = (p: Post): string => `${p.author}/${p.permlink}`;
const isRoot = (p: Post): boolean => !p.parent_author && !(p.depth && p.depth > 0);

/** Merges chain pages into items (newest first). */
function merge(items: WItem[], chain: string, posts: Post[], scores?: number[]): WItem[] {
  const by = new Map(items.map((i) => [i.key, i]));
  posts.forEach((p, i) => {
    if (!isRoot(p)) return;
    const k = keyOf(p); const it = by.get(k);
    if (it) { it.copies[chain] = p; if (scores) (it.sc ??= {})[chain] = scores[i]; return; }
    by.set(k, { key: k, lead: p, copies: { [chain]: p }, chains: [], at: 0, ...(scores ? { sc: { [chain]: scores[i] } } : {}) });
  });
  const out = [...by.values()];
  for (const it of out) {
    it.chains = CHAINS.filter((c) => it.copies[c.id]).map((c) => c.id);
    it.lead = it.copies[it.chains[0]]; // the Blurt copy when there is one, otherwise the first chain that has it
    it.at = it.sc ? Math.max(...Object.values(it.sc)) : toDate(it.lead.created).getTime() || 0; // ranked listing: the best rank (as -position), otherwise the date
  }
  return out.sort((a, b) => b.at - a.at || CHAINS.findIndex((c) => c.id === a.chains[0]) - CHAINS.findIndex((c) => c.id === b.chains[0]));
}

/**
 * Several sources (one per chain), each newest-first in pages, shown as ONE timeline.
 * A page of one chain may reach back a few minutes, a page of another a few weeks, so merged naively the timeline would have holes that later
 * pages fill in out of order. Instead an item is only shown when no source could still hold something newer: the "horizon" is the highest
 * "oldest post fetched so far" among the sources that have more. Loading more always advances the source that bounds the horizon
 * (the one that is furthest ahead in time), page after page, until enough new items are visible.
 */
const SHOW = 10;
function makeList(chains: () => string[], fetch: (chain: string, cur: Cursor) => Promise<Post[]>, forKey: () => string, ranked: () => boolean = () => false) {
  const list = reactive<WList>({ items: [], loading: false, sources: {}, for: '' });
  let buf: WItem[] = []; // everything fetched; `list.items` is the part above the horizon
  let run = 0;
  const horizon = (): number => { let h = -Infinity; for (const s of Object.values(list.sources)) if (s.more && s.oldest > h) h = s.oldest; return h; };
  const publish = (): void => { const h = horizon(); list.items = buf.filter((i) => i.at >= h); };
  async function fetchOne(c: string, id: number): Promise<void> {
    const s = list.sources[c];
    try {
      const posts = await fetch(c, s.cursor ?? {});
      if (id !== run) return;
      const last = posts[posts.length - 1];
      if (last) s.cursor = { start_author: last.author, start_permlink: last.permlink };
      const fresh = posts.filter((p) => !buf.some((i) => i.copies[c] && keyOf(i.copies[c]) === keyOf(p))); // the cursor post is returned again by the next page
      s.more = posts.length >= 10 && !!last; s.error = '';
      if (ranked()) {
        // a ranking (hot, trending) is ordered by position, not by date: position 0 of every chain first, then 1, …; chains are interleaved
        const n0 = s.n ?? 0; const scores = fresh.map((_, i) => -(n0 + i)); s.n = n0 + fresh.length;
        if (scores.length) s.oldest = Math.min(s.oldest, scores[scores.length - 1]);
        buf = merge(buf, c, fresh, scores);
      } else {
        const times = posts.map((p) => toDate(p.created).getTime()).filter((n) => n > 0);
        if (times.length) s.oldest = Math.min(s.oldest, ...times);
        buf = merge(buf, c, fresh);
      }
    } catch (e) { if (id === run) { s.error = (e as Error).message || String(e); s.more = false; } }
  }
  async function load(more = false): Promise<void> {
    const key = forKey();
    if (list.loading && more) return;
    if (!more) { run++; buf = []; Object.assign(list, { items: [], sources: Object.fromEntries(chains().map((c) => [c, { more: true, error: '', oldest: Infinity }])), for: key }); }
    const id = run; list.loading = true;
    if (!more) { await Promise.all(Object.keys(list.sources).map((c) => fetchOne(c, id))); if (id === run) publish(); }
    const want = (more ? list.items.length : 0) + SHOW;
    for (let n = 0; n < 8 && id === run && list.items.length < want; n++) {
      // the source that is furthest ahead in time (its oldest fetched post is the newest) is the one that bounds what may be shown
      const next = Object.keys(list.sources).filter((c) => list.sources[c].more).sort((a, b) => list.sources[b].oldest - list.sources[a].oldest)[0];
      if (!next) break;
      await fetchOne(next, id); if (id === run) publish();
    }
    if (id === run) { publish(); list.loading = false; }
  }
  return { list, load, reload: () => { list.for = ''; return load(false); }, canMore: (): boolean => Object.values(list.sources).some((s) => s.more) || buf.length > list.items.length };
}

/** Chains the reader switched OFF in Feed / Tags (e.g. a chain with little voting power or much noise). Kept on this device; a chain added later is on. */
const CK = 'bd-world-chains-off';
const readOff = (): string[] => { try { const o = JSON.parse(localStorage.getItem(CK) ?? '[]'); return Array.isArray(o) ? o.filter((x) => typeof x === 'string') : []; } catch { return []; } };
export const chainFilter = reactive<{ off: string[] }>({ off: readOff() });
export const chainOn = (c: string): boolean => !chainFilter.off.includes(c);
/** Switches a chain on/off; the last chain of `among` cannot be switched off. */
export function toggleChain(c: string, among: string[]): void {
  const off = chainOn(c) ? [...chainFilter.off, c] : chainFilter.off.filter((x) => x !== c);
  if (!among.some((x) => !off.includes(x))) return;
  chainFilter.off = off;
  try { localStorage.setItem(CK, JSON.stringify(off)); } catch { /* ignore */ }
}
const activeOf = (ids: string[]): string[] => { const on = ids.filter(chainOn); return on.length ? on : ids; };

/** Feed: every chain the visitor is logged in on (and has not switched off), with that chain's own account. */
const feedChains = (): string[] => activeOf(loggedChains().map((c) => c.id));
const feedKey = (): string => feedChains().map((c) => `${c}:${auth.sessions[c]?.user}`).join(',');
const feedL = makeList(feedChains, (c, cur) => adapter(c).feedPosts(auth.sessions[c].user, cur), feedKey);
export const worldFeed = feedL.list;
export const loadWorldFeed = (more = false): Promise<void> => (!more && worldFeed.for === feedKey() && worldFeed.items.length ? Promise.resolve() : feedL.load(more));
export const reloadWorldFeed = feedL.reload;
export const worldFeedMore = feedL.canMore;

/** One tag, on every chain (reading is public, so all chains are asked, not only the ones logged in). */
let curTag = ''; let curSort: Sort = 'created';
const tagChains = (): string[] => activeOf(CHAINS.map((c) => c.id));
const tagL = makeList(tagChains, (c, cur) => adapter(c).tagPosts(curTag, cur, curSort), () => `${curTag}|${curSort}|${tagChains().join()}`, () => curSort !== 'created');
export const worldTag = tagL.list;
export const loadWorldTag = (tag: string, more = false, sort: Sort = 'created'): Promise<void> => {
  if (!more && tag === curTag && sort === curSort && worldTag.for === `${tag}|${sort}|${tagChains().join()}`) return Promise.resolve();
  if (!more) { curTag = tag; curSort = sort; }
  return tagL.load(more);
};
export const worldTagMore = tagL.canMore;
export const reloadWorldTag = (sort: Sort = 'created'): Promise<void> => { curSort = sort; return tagL.reload(); };

/** Several followed tags together: only the first page of each tag on each chain (a bounded number of requests), newest 40. */
export type { Sort };
export const worldFollowed = reactive<WList>({ items: [], loading: false, sources: {}, for: '' });
let fRun = 0;
export async function loadWorldFollowed(tags: string[], force = false): Promise<void> {
  const key = tags.join(',') + '|' + tagChains().join();
  if (!force && worldFollowed.for === key) return;
  const id = ++fRun; Object.assign(worldFollowed, { items: [], loading: true, sources: {}, for: key });
  await Promise.all(tags.flatMap((tag) => CHAINS.filter((c) => tagChains().includes(c.id)).map(async (c) => {
    try { const posts = await adapter(c.id).tagPosts(tag); if (id === fRun) worldFollowed.items = merge(worldFollowed.items, c.id, posts).slice(0, 40); }
    catch (e) { if (id === fRun) worldFollowed.sources[`${tag}@${c.id}`] = { more: false, error: (e as Error).message || String(e), oldest: 0 }; }
  })));
  if (id === fRun) worldFollowed.loading = false;
}

// logging in/out or switching account: start the feed from scratch next time
watch(feedKey, () => { worldFeed.for = ''; worldFeed.items = []; });

/** One account's posts on one chain (profile page). */
let curAcc = { chain: '', account: '' };
const accL = makeList(() => [curAcc.chain], (c, cur) => adapter(c).accountPosts(curAcc.account, cur), () => `${curAcc.chain}:${curAcc.account}`);
export const worldAccount = accL.list;
export const loadWorldAccount = (chain: string, account: string, more = false): Promise<void> => {
  const k = `${chain}:${account}`;
  if (!more && worldAccount.for === k) return Promise.resolve();
  if (!more) curAcc = { chain, account };
  return accL.load(more);
};
export const worldAccountMore = accL.canMore;
