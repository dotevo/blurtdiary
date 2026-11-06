import { reactive } from 'vue';
import { CHAINS, adapter } from './chains';
import { accountOn } from './mirror';
import { payoutOf } from './util';
import type { Post } from './types';

/** Pending (not yet paid out) rewards of the blog's account on every chain it has an account on: each chain is simply asked for the account's latest posts. */
export interface PendingRow { chain: string; account: string; sum: number; n: number; state: 'ok' | 'loading' | 'error' }
export const pendingRows = reactive<Record<string, PendingRow>>({});
let runId = 0;

/**
 * The account's latest posts, whichever way the node can tell. Nodes differ (Hive: bridge; Steem: tags plugin; Melek: only the old
 * date-based call, whose date must fit in 32 bits – year 2038 – so "now + 1 day" is used). The first method that returns posts wins;
 * only when every method fails is it an error.
 */
async function latestPosts(chain: string, account: string): Promise<Post[]> {
  const c = adapter(chain);
  const soon = new Date(Date.now() + 86400000).toISOString().slice(0, 19);
  const tries: (() => Promise<Post[]>)[] = [
    () => c.call<Post[]>('bridge', 'get_account_posts', { sort: 'posts', account, limit: 20 }),
    () => c.call<Post[]>('condenser_api', 'get_discussions_by_blog', [{ tag: account, limit: 20 }]),
    () => c.call<Post[]>('condenser_api', 'get_discussions_by_author_before_date', [account, '', soon, 20]),
  ];
  let lastErr: unknown = null, ok = false;
  for (const f of tries) {
    try { const r = await f(); if (Array.isArray(r)) { ok = true; if (r.length) return r; } } catch (e) { lastErr = e; }
  }
  if (ok) return [];
  throw lastErr ?? new Error('no posts');
}

export async function loadPending(): Promise<void> {
  const id = ++runId;
  const chains = CHAINS.filter((c) => accountOn(c.id));
  for (const c of chains) pendingRows[c.id] = { chain: c.id, account: accountOn(c.id) as string, sum: pendingRows[c.id]?.sum ?? 0, n: pendingRows[c.id]?.n ?? 0, state: 'loading' };
  await Promise.all(chains.map(async (c) => {
    const account = accountOn(c.id) as string;
    let row: PendingRow;
    try {
      const open = (await latestPosts(c.id, account)).filter((p) => p?.author === account && p.is_paidout === false);
      row = { chain: c.id, account, sum: open.reduce((s, p) => s + payoutOf(p), 0), n: open.length, state: 'ok' };
    } catch { row = { chain: c.id, account, sum: 0, n: 0, state: 'error' }; }
    if (id === runId) pendingRows[c.id] = row; // a newer run took over otherwise
  }));
}
