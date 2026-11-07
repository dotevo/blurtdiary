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
import type { Cursor } from './chains/posts';
import type { Post } from './types';
import { toDate } from './util';

export interface WItem { key: string; lead: Post; copies: Record<string, Post>; chains: string[]; at: number }
interface Src { more: boolean; cursor?: Cursor; error: string }
export interface WList { items: WItem[]; loading: boolean; sources: Record<string, Src>; for: string }

const keyOf = (p: Post): string => `${p.author}/${p.permlink}`;
const isRoot = (p: Post): boolean => !p.parent_author && !(p.depth && p.depth > 0);

/** Merges chain pages into items (newest first). */
function merge(items: WItem[], chain: string, posts: Post[]): WItem[] {
  const by = new Map(items.map((i) => [i.key, i]));
  for (const p of posts) {
    if (!isRoot(p)) continue;
    const k = keyOf(p); const it = by.get(k);
    if (it) { it.copies[chain] = p; continue; }
    by.set(k, { key: k, lead: p, copies: { [chain]: p }, chains: [], at: 0 });
  }
  const out = [...by.values()];
  for (const it of out) {
    it.chains = CHAINS.filter((c) => it.copies[c.id]).map((c) => c.id);
    it.lead = it.copies[it.chains[0]]; // the Blurt copy when there is one, otherwise the first chain that has it
    it.at = toDate(it.lead.created).getTime() || 0;
  }
  return out.sort((a, b) => b.at - a.at);
}

function makeList(chains: () => string[], fetch: (chain: string, cur: Cursor) => Promise<Post[]>, forKey: () => string) {
  const list = reactive<WList>({ items: [], loading: false, sources: {}, for: '' });
  let run = 0;
  async function load(more = false): Promise<void> {
    const key = forKey();
    if (list.loading && more) return;
    if (!more) { run++; Object.assign(list, { items: [], sources: Object.fromEntries(chains().map((c) => [c, { more: true, error: '' }])), for: key }); }
    const id = run; list.loading = true;
    await Promise.all(Object.keys(list.sources).filter((c) => list.sources[c].more).map(async (c) => {
      const s = list.sources[c];
      try {
        const posts = await fetch(c, s.cursor ?? {});
        if (id !== run) return;
        const last = posts[posts.length - 1];
        if (last) s.cursor = { start_author: last.author, start_permlink: last.permlink };
        s.more = posts.length >= 10; s.error = '';
        const fresh = posts.filter((p) => !list.items.some((i) => i.copies[c] && keyOf(i.copies[c]) === keyOf(p))); // the cursor post is returned again by the next page
        list.items = merge(list.items, c, fresh);
      } catch (e) { if (id === run) { s.error = (e as Error).message || String(e); s.more = false; } }
    }));
    if (id === run) list.loading = false;
  }
  return { list, load, reload: () => { list.for = ''; return load(false); }, canMore: (): boolean => Object.values(list.sources).some((s) => s.more) };
}

/** Feed: every chain the visitor is logged in on, with that chain's own account. */
const feedChains = (): string[] => loggedChains().map((c) => c.id);
const feedKey = (): string => loggedChains().map((c) => `${c.id}:${auth.sessions[c.id]?.user}`).join(',');
const feedL = makeList(feedChains, (c, cur) => adapter(c).feedPosts(auth.sessions[c].user, cur), feedKey);
export const worldFeed = feedL.list;
export const loadWorldFeed = (more = false): Promise<void> => (!more && worldFeed.for === feedKey() && worldFeed.items.length ? Promise.resolve() : feedL.load(more));
export const reloadWorldFeed = feedL.reload;
export const worldFeedMore = feedL.canMore;

/** One tag, on every chain (reading is public, so all chains are asked, not only the ones logged in). */
let curTag = '';
const tagL = makeList(() => CHAINS.map((c) => c.id), (c, cur) => adapter(c).tagPosts(curTag, cur), () => curTag);
export const worldTag = tagL.list;
export const loadWorldTag = (tag: string, more = false): Promise<void> => { if (!more && tag === curTag && worldTag.for === tag) return Promise.resolve(); if (!more) curTag = tag; return tagL.load(more); };
export const worldTagMore = tagL.canMore;
export const reloadWorldTag = tagL.reload;

/** Several followed tags together: only the first page of each tag on each chain (a bounded number of requests), newest 40. */
export const worldFollowed = reactive<WList>({ items: [], loading: false, sources: {}, for: '' });
let fRun = 0;
export async function loadWorldFollowed(tags: string[], force = false): Promise<void> {
  const key = tags.join(',');
  if (!force && worldFollowed.for === key) return;
  const id = ++fRun; Object.assign(worldFollowed, { items: [], loading: true, sources: {}, for: key });
  await Promise.all(tags.flatMap((tag) => CHAINS.map(async (c) => {
    try { const posts = await adapter(c.id).tagPosts(tag); if (id === fRun) worldFollowed.items = merge(worldFollowed.items, c.id, posts).slice(0, 40); }
    catch (e) { if (id === fRun) worldFollowed.sources[`${tag}@${c.id}`] = { more: false, error: (e as Error).message || String(e) }; }
  })));
  if (id === fRun) worldFollowed.loading = false;
}

// logging in/out or switching account: start the feed from scratch next time
watch(feedKey, () => { worldFeed.for = ''; worldFeed.items = []; });
