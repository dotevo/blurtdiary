import { reactive } from 'vue';
import { CHAINS } from './chains';
import { accountOn } from './mirror';
import { payoutOf } from './util';

/** Pending (not yet paid out) rewards of the blog's account on every chain it has an account on. HOW a chain lists the account's posts is the chain adapter's business (`latestPosts`). */
export interface PendingRow { chain: string; account: string; sum: number; n: number; state: 'ok' | 'loading' | 'error' }
export const pendingRows = reactive<Record<string, PendingRow>>({});
let runId = 0;

export async function loadPending(): Promise<void> {
  const id = ++runId;
  const chains = CHAINS.filter((c) => accountOn(c.id));
  for (const c of chains) pendingRows[c.id] = { chain: c.id, account: accountOn(c.id) as string, sum: pendingRows[c.id]?.sum ?? 0, n: pendingRows[c.id]?.n ?? 0, state: 'loading' };
  await Promise.all(chains.map(async (c) => {
    const account = accountOn(c.id) as string;
    let row: PendingRow;
    try {
      const open = (await c.latestPosts(account)).filter((p) => p?.author === account && p.is_paidout === false);
      row = { chain: c.id, account, sum: open.reduce((s, p) => s + payoutOf(p), 0), n: open.length, state: 'ok' };
    } catch { row = { chain: c.id, account, sum: 0, n: 0, state: 'error' }; }
    if (id === runId) pendingRows[c.id] = row; // a newer run took over otherwise
  }));
}
