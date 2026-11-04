/**
 * The logged-in user's Blurt feed: the latest posts of the accounts they follow (Blurt is the primary chain, so only Blurt is read).
 * Preferred call is `bridge.get_account_posts {sort:'feed'}`; nodes without it are asked `condenser_api.get_discussions_by_feed`.
 */
import { reactive, watch } from 'vue';
import { auth } from './auth';
import { rpc } from './rpc';
import type { Post } from './types';

const PAGE = 20;
export const feed = reactive({ posts: [] as Post[], loading: false, more: true, error: '', loadedFor: '' });

async function fetchFeed(account: string, last?: Post): Promise<Post[]> {
  const cursor = last ? { start_author: last.author, start_permlink: last.permlink } : {};
  const ok = (r: unknown): r is Post[] => Array.isArray(r);
  try {
    const r = await rpc<Post[]>('bridge', 'get_account_posts', { sort: 'feed', account, limit: PAGE, ...cursor });
    if (ok(r) && (r.length || last)) return r;
  } catch { /* fall through to the older API */ }
  const r = await rpc<Post[]>('condenser_api', 'get_discussions_by_feed', [{ tag: account, limit: PAGE, ...cursor }]);
  return ok(r) ? r : [];
}

/** Loads the first page (or the next one with `more`). Safe to call repeatedly. */
export async function loadFeed(more = false): Promise<void> {
  const me = auth.me?.user; if (!me || feed.loading) return;
  if (!more && feed.loadedFor === me) return;
  if (!more) Object.assign(feed, { posts: [], more: true, error: '', loadedFor: me });
  if (!feed.more) return;
  feed.loading = true;
  try {
    const last = more ? feed.posts[feed.posts.length - 1] : undefined;
    let res = await fetchFeed(me, last);
    if (last) res = res.filter((p) => !(p.author === last.author && p.permlink === last.permlink));
    const seen = new Set(feed.posts.map((p) => `${p.author}/${p.permlink}`));
    feed.posts.push(...res.filter((p) => !seen.has(`${p.author}/${p.permlink}`)));
    if (res.length < PAGE - 1) feed.more = false;
  } catch (e) { feed.error = (e as Error).message || String(e); feed.loadedFor = ''; }
  finally { feed.loading = false; }
}
export const reloadFeed = (): Promise<void> => { feed.loadedFor = ''; return loadFeed(); };

/** Link to a post in its AUTHOR's own blog (the feed mixes many authors). */
export const feedHref = (p: Post): string => `?user=${encodeURIComponent(p.author)}&post=${encodeURIComponent(p.permlink)}`;

// a different account (or logging out) starts from scratch
watch(() => auth.me?.user, (u) => { feed.posts = []; feed.more = true; feed.error = ''; feed.loadedFor = ''; if (u) void loadFeed(); });
