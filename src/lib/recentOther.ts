import { reactive } from 'vue';
import { CHAINS, PRIMARY } from './chains';
import { accountOn } from './mirror';
import type { Post } from './types';

/** Recent comments under the blog account's posts on the MIRROR chains (Blurt's own are loaded by the store). How a chain lists them is its adapter's business (`recentReplies`). */
export const recentOther = reactive<{ rows: { chain: string; post: Post }[]; state: Record<string, 'loading' | 'ok' | 'error'> }>({ rows: [], state: {} });
let run = 0;
export async function loadRecentOther(): Promise<void> {
  const id = ++run;
  const chains = CHAINS.filter((c) => c.id !== PRIMARY && accountOn(c.id));
  recentOther.rows = []; recentOther.state = Object.fromEntries(chains.map((c) => [c.id, 'loading' as const]));
  await Promise.all(chains.map(async (c) => {
    try {
      const list = await c.recentReplies(accountOn(c.id) as string);
      if (id !== run) return;
      recentOther.rows = [...recentOther.rows, ...list.map((post) => ({ chain: c.id, post }))]; recentOther.state[c.id] = 'ok';
    } catch (e) { console.warn('recent comments', c.id, e); if (id === run) recentOther.state[c.id] = 'error'; }
  }));
}
