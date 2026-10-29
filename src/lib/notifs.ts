import { reactive, computed } from 'vue';
import { auth } from './auth';
import { coalMap, coalReady } from './coal';
import { rpc } from './rpc';
import { href, postParam } from './store';

/** `chain` = where the notification comes from (only Blurt for now; other chains can feed the same list later). */
export interface Notif { id: number; type: string; score: number; date: string; msg: string; url?: string; chain: string }
export const notifs = reactive({ items: [] as Notif[], open: false, loading: false, lastRead: 0 });

const rk = (): string => `bd_notif_read_${auth.me?.user}`;
export const unread = computed(() => notifs.items.filter((n) => n.id > notifs.lastRead).length);

export async function loadNotifs(): Promise<void> {
  const me = auth.me?.user; if (!me) return;
  notifs.loading = true;
  try {
    await coalReady;
    const r = await rpc<Notif[]>('bridge', 'account_notifications', { account: me, limit: 40 });
    // notifications triggered by COAL accounts (mention spam etc.) are dropped
    notifs.items = (r ?? []).map((n) => ({ ...n, chain: 'blurt' })).filter((n) => { const a = n.msg?.match(/^@([a-z0-9.-]+)/)?.[1]; return !(a && coalMap.value.has(a)); });
    try { notifs.lastRead = Number(localStorage.getItem(rk()) ?? 0); } catch { /* ignore */ }
  } catch (e) { console.warn('notifications', e); } finally { notifs.loading = false; }
}
function markRead(): void {
  const max = Math.max(notifs.lastRead, ...notifs.items.map((n) => n.id));
  notifs.lastRead = max;
  try { localStorage.setItem(rk(), String(max)); } catch { /* ignore */ }
}
export function toggleNotifs(): void {
  notifs.open = !notifs.open;
  if (notifs.open) void loadNotifs(); else markRead(); // unread items stay marked while the panel is open
}
export function closeNotifs(): void { if (notifs.open) { notifs.open = false; markRead(); } }

/** url is "@author/permlink" – a post or a comment; the diary resolves comments to their root post and highlights them. */
export function notifHref(n: Notif): string {
  const m = n.url?.replace(/^@/, '').match(/^([^/]+)\/(.+)$/);
  return m ? href({ post: postParam(m[1], m[2]), c: `${m[1]}/${m[2]}` }) : '';
}
export const notifIcon = (t: string): string =>
  t.startsWith('reply') ? '💬' : t === 'vote' ? '♥' : t === 'mention' ? '@' : t === 'reblog' ? '↻' : t === 'follow' ? '＋' : t.includes('transfer') ? '💸' : '🔔';
