/**
 * "Latest posts of an account" – the ways a node can answer differ per chain, so every chain adapter lists its own methods in its own
 * order (see `pending` in blurt.ts / hive.ts / steem.ts / melek.ts). Nothing here is chain specific.
 */
import type { Post } from '../types';
import type { ChainAdapter } from './types';

export type PostsMethod = (c: ChainAdapter, account: string) => Promise<Post[]>;

/** Hivemind-style `bridge` API (Blurt, Hive). */
export const viaBridge: PostsMethod = (c, account) => c.call<Post[]>('bridge', 'get_account_posts', { sort: 'posts', account, limit: 20 });
/** `tags` plugin (Steem and the older forks). */
export const viaBlog: PostsMethod = (c, account) => c.call<Post[]>('condenser_api', 'get_discussions_by_blog', [{ tag: account, limit: 20 }]);
/** Old date-based call. The date must fit 32 bits (year 2038), so "tomorrow" is used rather than a far-future date. */
export const viaAuthorDate: PostsMethod = (c, account) =>
  c.call<Post[]>('condenser_api', 'get_discussions_by_author_before_date', [account, '', new Date(Date.now() + 86400000).toISOString().slice(0, 19), 20]);
/**
 * Works on any node that keeps account history: the root posts the account itself wrote (history lists every `comment` operation),
 * then each one is fetched with `get_content`. Fetches at most `max` distinct posts, newest first.
 */
export const viaHistory = (max = 12): PostsMethod => async (c, account) => {
  const rows = await c.call<[number, { op: [string, Record<string, unknown>] }][]>('condenser_api', 'get_account_history', [account, -1, 300]);
  const permlinks: string[] = [];
  for (const [, h] of [...(Array.isArray(rows) ? rows : [])].reverse()) {
    const [type, o] = h?.op ?? [];
    if (type === 'comment' && o.author === account && o.parent_author === '' && typeof o.permlink === 'string' && !permlinks.includes(o.permlink)) permlinks.push(o.permlink);
    if (permlinks.length >= max) break;
  }
  const posts = await Promise.all(permlinks.map((pl) => c.getContent(account, pl).catch(() => null)));
  return posts.filter((p): p is Post => !!p);
};

/** The first method that returns posts wins; an empty answer moves on to the next; only when every method fails it is an error. */
export async function firstPosts(c: ChainAdapter, account: string, methods: PostsMethod[]): Promise<Post[]> {
  let lastErr: unknown = null, answered = false;
  for (const m of methods) {
    try { const r = await m(c, account); if (Array.isArray(r)) { answered = true; if (r.length) return r; } } catch (e) { lastErr = e; }
  }
  if (answered) return [];
  throw lastErr ?? new Error('no posts');
}

// ---------- listings for the "world" views (feed of followed accounts, posts of a tag) ----------
export interface Cursor { start_author?: string; start_permlink?: string }
export const PAGE = 15;
export type ListMethod<A> = (c: ChainAdapter, arg: A, cur: Cursor) => Promise<Post[]>;

const looksLikePosts = (r: unknown): r is Post[] => Array.isArray(r) && r.every((p) => p && typeof p.author === 'string' && typeof p.permlink === 'string' && typeof p.created === 'string');
/** Same "first method that answers" rule as `firstPosts`, for any listing. A page after the first may legitimately be empty. */
export async function firstList<A>(c: ChainAdapter, arg: A, cur: Cursor, methods: ListMethod<A>[]): Promise<Post[]> {
  let lastErr: unknown = null, answered = false;
  for (const m of methods) {
    try { const r = await m(c, arg, cur); if (looksLikePosts(r)) { answered = true; if (r.length || cur.start_author) return r; } } catch (e) { lastErr = e; }
  }
  if (answered) return [];
  throw lastErr ?? new Error('no posts');
}
/** Feed of the accounts `account` follows. */
export const feedBridge: ListMethod<string> = (c, account, cur) => c.call<Post[]>('bridge', 'get_account_posts', { sort: 'feed', account, limit: PAGE, ...cur });
export const feedCondenser: ListMethod<string> = (c, account, cur) => c.call<Post[]>('condenser_api', 'get_discussions_by_feed', [{ tag: account, limit: PAGE, ...cur }]);
/** Newest posts with a tag. */
export const tagBridge: ListMethod<string> = (c, tag, cur) => c.call<Post[]>('bridge', 'get_ranked_posts', { sort: 'created', tag, limit: PAGE, ...cur });
export const tagCondenser: ListMethod<string> = (c, tag, cur) => c.call<Post[]>('condenser_api', 'get_discussions_by_created', [{ tag, limit: PAGE, ...cur }]);
