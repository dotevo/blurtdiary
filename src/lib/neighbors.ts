/**
 * "Next / previous post" of a blog. The blog loads its posts newest first in pages, so the neighbours of a post are mostly already in memory.
 * What is not is asked from the node with ONE small request (the posts right after this one, which is how the node pages anyway). The node can only walk
 * towards OLDER posts, so a newer neighbour is known only from memory: from the loaded list, or because we arrived from it (every step is remembered).
 */
import { reactive } from 'vue';
import { rpc } from './rpc';
import { CONFIG_PERMLINK } from './config';
import { state, USER } from './store';
import type { Post } from './types';

/** older = the previous post (written earlier), newer = the next one. null = there is none, undefined = not known. */
interface Link { older?: Post | null; newer?: Post | null }
const memo = new Map<string, Link>();
export const nav = reactive<{ key: string; older: Post | null; newer: Post | null; loading: boolean }>({ key: '', older: null, newer: null, loading: false });
let run = 0;

const real = (x: Post): boolean => x.author === USER && x.permlink !== CONFIG_PERMLINK && !x.parent_author;
/** The post right after `post` going back in time (1-2 posts requested, bridge first, then the older blog call). */
async function olderOf(post: Post): Promise<Post | null> {
  const cur = { start_author: post.author, start_permlink: post.permlink };
  let rows: Post[];
  try { rows = await rpc<Post[]>('bridge', 'get_account_posts', { sort: 'posts', account: USER, limit: 3, ...cur }); }
  catch { rows = await rpc<Post[]>('condenser_api', 'get_discussions_by_blog', [{ tag: USER, limit: 3, ...cur }]); }
  return rows.find((x) => x.permlink !== post.permlink && real(x)) ?? null;
}

export async function loadNeighbors(post: Post): Promise<void> {
  const my = ++run; const key = post.permlink;
  const list = state.posts; const i = list.findIndex((x) => x.permlink === key);
  const m = memo.get(key) ?? {};
  let newer: Post | null | undefined = i > 0 ? list[i - 1] : i === 0 && !state.pinned ? null : m.newer;
  let older: Post | null | undefined = i >= 0 && i < list.length - 1 ? list[i + 1] : i >= 0 && !state.more ? null : m.older;
  Object.assign(nav, { key, newer: newer ?? null, older: older ?? null, loading: older === undefined });
  if (older === undefined) {
    try { older = await olderOf(post); } catch (e) { console.warn('previous post', e); }
  }
  if (my !== run) return;
  if (older) memo.set(older.permlink, { ...memo.get(older.permlink), newer: post });
  if (newer) memo.set(newer.permlink, { ...memo.get(newer.permlink), older: post });
  memo.set(key, { older, newer });
  Object.assign(nav, { newer: newer ?? null, older: older ?? null, loading: false });
}
