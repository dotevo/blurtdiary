import { reactive, computed } from 'vue';
import { auth } from './auth';
import { adapter, CHAINS, PRIMARY } from './chains';
import { coalMap, coalReady } from './coal';
import { rpc } from './rpc';
import { href, postParam } from './store';

/** `chain` = where the notification comes from. Blurt always; Hive/Steem/… for every chain we are logged in on (when its node has the bridge API). */
export interface Notif { id: number; type: string; score: number; date: string; msg: string; url?: string; chain: string; /** 'hist' = rebuilt from the account history (its ids are not comparable with the bridge ids) */ src?: 'hist' }
export const notifs = reactive({ items: [] as Notif[], open: false, loading: false, lastRead: {} as Record<string, number> });
/** Read-state is kept per chain and per source (bridge ids and history indexes are different number series). */
const rkey = (n: { chain: string; src?: string }): string => (n.src ? `${n.chain}:${n.src}` : n.chain);

/** Storage key of the read-state. Blurt's bridge list keeps its old key; every other chain/source has its own. */
const rk = (key: string): string => { const [chain, src] = key.split(':'); return (src ? `bd_notif_read_${src}_` : 'bd_notif_read_') + (chain === PRIMARY ? '' : chain + '_') + (auth.sessions[chain]?.user ?? auth.me?.user); };
const isUnread = (n: Notif): boolean => n.id > (notifs.lastRead[rkey(n)] ?? 0);
export { isUnread };
export const unread = computed(() => notifs.items.filter(isUnread).length);
const stamp = (n: Notif): number => Date.parse(/Z|[+-]\d\d:?\d\d$/.test(n.date) ? n.date : n.date + 'Z') || 0;

/**
 * The same thing happening on several chains (one person voting on, or replying to, the same permlink on Blurt, Hive, … within 5 minutes)
 * is ONE entry with several chain dots. Notifications without a link (transfers) are never merged.
 */
export interface NotifGroup { items: Notif[]; lead: Notif; chains: string[]; unread: boolean }
const GROUP_MS = 5 * 60 * 1000;
const keyOfNotif = (n: Notif): string | null => {
  const m = n.url?.replace(/^@/, '').match(/^[^/]+\/(.+)$/); const who = n.msg.match(/^@([a-z0-9.-]+)/)?.[1];
  return m && who ? `${n.type}|${who}|${m[1]}` : null;
};
export const notifGroups = computed<NotifGroup[]>(() => {
  const groups: { key: string | null; items: Notif[] }[] = [];
  for (const n of notifs.items) { // items are sorted newest first
    const k = keyOfNotif(n);
    const g = k ? groups.find((x) => x.key === k && !x.items.some((i) => i.chain === n.chain) && Math.abs(stamp(x.items[0]) - stamp(n)) <= GROUP_MS) : undefined;
    if (g) g.items.push(n); else groups.push({ key: k, items: [n] });
  }
  return groups.map(({ items }) => {
    const sorted = [...items].sort((a, b) => CHAINS.findIndex((c) => c.id === a.chain) - CHAINS.findIndex((c) => c.id === b.chain)); // Blurt first
    return { items: sorted, lead: sorted[0], chains: sorted.map((i) => i.chain), unread: sorted.some(isUnread) };
  });
});
const coalOk = (n: Notif): boolean => { const a = n.msg?.match(/^@([a-z0-9.-]+)/)?.[1]; return !(a && coalMap.value.has(a)); }; // COAL accounts (mention spam etc.) are dropped
type Hist = [number, { op: [string, Record<string, unknown>]; timestamp: string }];
/**
 * Fallback for chains whose node has no `bridge` API (e.g. Melek): the account history already lists the operations that concern
 * the account, so votes, replies and incoming transfers are rebuilt from it. Less rich than the bridge, but nothing is missed.
 */
async function fromHistory(chain: string, account: string, only?: string): Promise<Notif[]> {
  const rows = await adapter(chain).call<Hist[]>('condenser_api', 'get_account_history', [account, -1, only ? 150 : 60]);
  const out: Notif[] = [];
  for (const [id, h] of Array.isArray(rows) ? rows : []) {
    const [type, o] = h?.op ?? [];
    const str = (k: string): string => (typeof o?.[k] === 'string' ? (o[k] as string) : '');
    const base = { id, score: 50, date: h.timestamp, chain, src: 'hist' as const };
    if (only && type !== only) continue;
    if (type === 'vote' && str('author') === account && str('voter') !== account) {
      const w = Number(o.weight) / 100;
      if (w > 0) out.push({ ...base, type: 'vote', msg: `@${str('voter')} voted on your post or comment (${w}%)`, url: `@${account}/${str('permlink')}` });
    } else if (type === 'comment' && str('parent_author') === account && str('author') !== account) {
      out.push({ ...base, type: 'reply', msg: `@${str('author')} replied to you`, url: `@${str('author')}/${str('permlink')}` });
    } else if (type === 'transfer' && str('to') === account && str('from') !== account) {
      out.push({ ...base, type: 'transfer', msg: `@${str('from')} sent you ${str('amount')}` });
    }
  }
  return out;
}
async function fromChain(chain: string, account: string): Promise<Notif[]> {
  let list: Notif[] | null = null;
  try {
    const r = chain === PRIMARY
      ? await rpc<Notif[]>('bridge', 'account_notifications', { account, limit: 40 })
      : await adapter(chain).call<Notif[]>('bridge', 'account_notifications', { account, limit: 40 });
    if (Array.isArray(r)) list = r.filter((n) => n && typeof n.msg === 'string' && typeof n.date === 'string').map((n) => ({ ...n, chain }));
  } catch (e) { console.warn('notifications (bridge)', chain, e); }
  try {
    if (!list) { if (chain !== PRIMARY) list = await fromHistory(chain, account); }
    else if (!list.some((n) => n.type.includes('transfer'))) list = [...list, ...(await fromHistory(chain, account, 'transfer'))]; // a bridge without money notifications: add incoming transfers
  } catch (e) { console.warn('notifications (history)', chain, e); }
  return (list ?? []).filter(coalOk);
}

export async function loadNotifs(): Promise<void> {
  const me = auth.me?.user; if (!me) return;
  notifs.loading = true;
  try {
    await coalReady;
    const chains = CHAINS.filter((c) => c.id === PRIMARY || auth.sessions[c.id]);
    const lists = await Promise.all(chains.map((c) => fromChain(c.id, c.id === PRIMARY ? me : auth.sessions[c.id].user)));
    notifs.items = lists.flat().sort((a, b) => stamp(b) - stamp(a)).slice(0, 80);
    for (const n of notifs.items) { const k = rkey(n); try { notifs.lastRead[k] = Number(localStorage.getItem(rk(k)) ?? 0); } catch { /* ignore */ } }
  } catch (e) { console.warn('notifications', e); } finally { notifs.loading = false; }
}
function markRead(): void {
  for (const n of notifs.items) notifs.lastRead[rkey(n)] = Math.max(notifs.lastRead[rkey(n)] ?? 0, n.id);
  for (const c of Object.keys(notifs.lastRead)) { try { localStorage.setItem(rk(c), String(notifs.lastRead[c])); } catch { /* ignore */ } }
}
export function toggleNotifs(): void {
  notifs.open = !notifs.open;
  if (notifs.open) void loadNotifs(); else markRead(); // unread items stay marked while the panel is open
}
export function closeNotifs(): void { if (notifs.open) { notifs.open = false; markRead(); } }

/** url is "@author/permlink" – a post or a comment; the diary resolves comments to their root post and highlights them. */
/**
 * Where a notification leads: always a page of this front end (another chain's items open in the `?chain=` reader).
 */
export function notifLink(n: Notif): { href: string; ext: boolean } {
  const m = n.url?.replace(/^@/, '').match(/^([^/]+)\/(.+)$/);
  if (!m) return { href: '', ext: false };
  if (n.chain === PRIMARY) return { href: href({ post: postParam(m[1], m[2]), c: `${m[1]}/${m[2]}` }), ext: false };
  // another chain: read in our own page; the page resolves a comment to its root post and prefers the Blurt copy (whole thread)
  return { href: href({ post: postParam(m[1], m[2]), chain: n.chain, ...(m[1] === auth.sessions[n.chain]?.user ? {} : { c: `${m[1]}/${m[2]}` }) }), ext: false };
}
export const notifHref = (n: Notif): string => notifLink(n).href;
export const notifIcon = (t: string): string =>
  t.startsWith('reply') ? '💬' : t === 'vote' ? '♥' : t === 'mention' ? '@' : t === 'reblog' ? '↻' : t === 'follow' ? '＋' : t.includes('transfer') ? '💸' : '🔔';
