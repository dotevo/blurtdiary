/**
 * Helpers shared by the chain adapters for turning the different "discussion" shapes into one ChainThread.
 * The shapes themselves (which RPC method returns them) are chain specific and live in each adapter.
 */
import type { Post } from '../types';
import type { ChainAdapter, ChainId, ChainThread } from './types';

export const keyOf = (p: { author: string; permlink: string }): string => `${p.author}/${p.permlink}`;

/** Builds a ChainThread from a flat "author/permlink -> post" map that contains the root and all its descendants. */
export function threadFromMap(chain: ChainId, rootKey: string, map: Record<string, Post>): ChainThread | null {
  const root = map[rootKey];
  if (!root?.author) return null;
  const kids: Record<string, Post[]> = {};
  for (const [k, c] of Object.entries(map)) {
    if (k === rootKey || !c?.author) continue;
    (kids[`${c.parent_author}/${c.parent_permlink}`] ||= []).push(c);
  }
  Object.values(kids).forEach((l) => l.sort((a, b) => a.created.localeCompare(b.created)));
  return { chain, status: 'found', root, kids };
}

/**
 * Fallback for nodes without a discussion method: walks the tree with `get_content_replies`.
 * Bounded (depth and number of requests) so a huge thread cannot hammer a public node.
 */
export async function threadByReplies(
  chain: ChainId, root: Post, replies: (author: string, permlink: string) => Promise<Post[]>, maxRequests = 60,
): Promise<ChainThread> {
  const kids: Record<string, Post[]> = {};
  let budget = maxRequests;
  const walk = async (p: Post): Promise<void> => {
    if (budget-- <= 0 || !(p.children ?? 1)) return;
    const list = (await replies(p.author, p.permlink).catch(() => [] as Post[])).filter((c) => c?.author);
    if (!list.length) return;
    list.sort((a, b) => a.created.localeCompare(b.created));
    kids[keyOf(p)] = list;
    await Promise.all(list.map(walk));
  };
  await walk(root);
  return { chain, status: 'found', root, kids };
}

export const missingThread = (chain: ChainId): ChainThread => ({ chain, status: 'missing', kids: {} });
export const errorThread = (chain: ChainId, e: unknown): ChainThread => ({ chain, status: 'error', kids: {}, error: (e as Error)?.message ?? String(e) });

/**
 * Common "find a post and its thread" flow, used by every adapter:
 *   1. `discussion()` – the chain's own one-request discussion call (bridge.get_discussion, get_state, …).
 *      Any failure or empty answer just means "try the slow path", it is NEVER read as "post missing".
 *   2. `getContent` – condenser_api.get_content answers with an empty author for a non-existent post, which is the
 *      only reliable "not published here" signal. If even this call cannot reach a node, the status is `error`.
 *   3. a post that exists but has no discussion call available → walk get_content_replies.
 * `eager`: start both calls at once and answer "missing" as soon as get_content says so, without waiting for a slow
 * discussion call (used for the secondary chains, whose public nodes are slower and often miss the post altogether).
 */
export async function resolveThread(
  a: Pick<ChainAdapter, 'id' | 'getContent' | 'call'>, author: string, permlink: string,
  discussion: () => Promise<Record<string, Post> | null | undefined>, eager = false,
): Promise<ChainThread> {
  const disc = (): Promise<ChainThread | null> => discussion()
    .then((map) => (map ? threadFromMap(a.id, `${author}/${permlink}`, map) : null))
    .catch((e) => { console.warn(`${a.id}: discussion call failed, falling back`, e); return null; });
  const replies = (root: Post): Promise<ChainThread> =>
    threadByReplies(a.id, root, (au, pl) => a.call<Post[]>('condenser_api', 'get_content_replies', [au, pl]));
  try {
    const d = eager ? disc() : null;
    if (!eager) { const t = await disc(); if (t) return t; }
    const root = await a.getContent(author, permlink);
    if (!root) return missingThread(a.id);
    return (d && (await d)) || (await replies(root));
  } catch (e) { return errorThread(a.id, e); }
}
