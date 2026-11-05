import { reactive, computed } from 'vue';
import { auth } from './auth';
import { adapter, CHAINS, PRIMARY } from './chains';
import { coalMap, coalReady } from './coal';
import { rpc } from './rpc';
import { href, postParam } from './store';

/** `chain` = where the notification comes from. Blurt always; Hive/Steem/… for every chain we are logged in on (when its node has the bridge API). */
export interface Notif { id: number; type: string; score: number; date: string; msg: string; url?: string; chain: string }
export const notifs = reactive({ items: [] as Notif[], open: false, loading: false, lastRead: {} as Record<string, number> });

/** Blurt keeps its old storage key; the other chains have their own (ids are only comparable within one chain). */
const rk = (chain: string): string => (chain === PRIMARY ? `bd_notif_read_${auth.me?.user}` : `bd_notif_read_${chain}_${auth.sessions[chain]?.user}`);
const isUnread = (n: Notif): boolean => n.id > (notifs.lastRead[n.chain] ?? 0);
export { isUnread };
export const unread = computed(() => notifs.items.filter(isUnread).length);
const stamp = (n: Notif): number => Date.parse(/Z|[+-]\d\d:?\d\d$/.test(n.date) ? n.date : n.date + 'Z') || 0;

const coalOk = (n: Notif): boolean => { const a = n.msg?.match(/^@([a-z0-9.-]+)/)?.[1]; return !(a && coalMap.value.has(a)); }; // COAL accounts (mention spam etc.) are dropped
async function fromChain(chain: string, account: string): Promise<Notif[]> {
  try {
    const r = chain === PRIMARY
      ? await rpc<Notif[]>('bridge', 'account_notifications', { account, limit: 40 })
      : await adapter(chain).call<Notif[]>('bridge', 'account_notifications', { account, limit: 40 });
    return Array.isArray(r) ? r.filter((n) => n && typeof n.msg === 'string' && typeof n.date === 'string').map((n) => ({ ...n, chain })).filter(coalOk) : [];
  } catch (e) { console.warn('notifications', chain, e); return []; } // a node without the bridge API simply has none
}

export async function loadNotifs(): Promise<void> {
  const me = auth.me?.user; if (!me) return;
  notifs.loading = true;
  try {
    await coalReady;
    const chains = CHAINS.filter((c) => c.id === PRIMARY || auth.sessions[c.id]);
    const lists = await Promise.all(chains.map((c) => fromChain(c.id, c.id === PRIMARY ? me : auth.sessions[c.id].user)));
    notifs.items = lists.flat().sort((a, b) => stamp(b) - stamp(a)).slice(0, 80);
    for (const c of chains) { try { notifs.lastRead[c.id] = Number(localStorage.getItem(rk(c.id)) ?? 0); } catch { /* ignore */ } }
  } catch (e) { console.warn('notifications', e); } finally { notifs.loading = false; }
}
function markRead(): void {
  for (const n of notifs.items) notifs.lastRead[n.chain] = Math.max(notifs.lastRead[n.chain] ?? 0, n.id);
  for (const c of Object.keys(notifs.lastRead)) { try { localStorage.setItem(rk(c), String(notifs.lastRead[c])); } catch { /* ignore */ } }
}
export function toggleNotifs(): void {
  notifs.open = !notifs.open;
  if (notifs.open) void loadNotifs(); else markRead(); // unread items stay marked while the panel is open
}
export function closeNotifs(): void { if (notifs.open) { notifs.open = false; markRead(); } }

/** url is "@author/permlink" – a post or a comment; the diary resolves comments to their root post and highlights them. */
/**
 * Where a notification leads. Blurt: the diary page. Another chain: the diary page when it is about the user's own post (the mirror
 * has the same permlink on Blurt), otherwise that chain's own web page (opened in a new tab) – we may not have that thread on Blurt.
 */
export function notifLink(n: Notif): { href: string; ext: boolean } {
  const m = n.url?.replace(/^@/, '').match(/^([^/]+)\/(.+)$/);
  if (!m) return { href: '', ext: false };
  if (n.chain === PRIMARY) return { href: href({ post: postParam(m[1], m[2]), c: `${m[1]}/${m[2]}` }), ext: false };
  if (m[1] === auth.sessions[n.chain]?.user && auth.me) return { href: href({ post: postParam(auth.me.user, m[2]) }), ext: false };
  return { href: adapter(n.chain).postUrl(m[1], m[2]), ext: true };
}
export const notifHref = (n: Notif): string => notifLink(n).href;
export const notifIcon = (t: string): string =>
  t.startsWith('reply') ? '💬' : t === 'vote' ? '♥' : t === 'mention' ? '@' : t === 'reblog' ? '↻' : t === 'follow' ? '＋' : t.includes('transfer') ? '💸' : '🔔';
