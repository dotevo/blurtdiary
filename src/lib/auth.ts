import { reactive, ref } from 'vue';
import * as dblurt from '@beblurt/dblurt';
import { adapter, CHAINS, PRIMARY, type ChainAdapter, type ChainId } from './chains';
import { t } from './i18n';
import type { Operation, Session } from './types';

// ---- sessions: one per chain. By default they live in this tab only (sessionStorage). A login with "remember" is ALSO copied
// to localStorage (SAVED) so it survives closing the tab - opt-in, because the posting key then sits on the device in plain text.
const KEY = 'bd-sessions';
const SAVED = 'bd-saved-sessions';
const readJson = (st: Storage, k: string): Record<string, Session> => { try { return JSON.parse(st.getItem(k) ?? 'null') ?? {}; } catch { return {}; } };
function load(): Record<string, Session> {
  let s: Record<string, Session> = { ...readJson(localStorage, SAVED), ...readJson(sessionStorage, KEY) };
  try {
    const old = JSON.parse(sessionStorage.getItem('bd-session') ?? 'null'); // single-chain sessions of older versions
    if (old && !s[PRIMARY]) s = { ...s, [PRIMARY]: { ...old, chain: PRIMARY } };
  } catch { /* ignore */ }
  if (!s[PRIMARY]) s = {}; // other chains only exist on top of a Blurt login
  return s;
}
const initial = load();
/**
 * `sessions` holds every login by chain id. `me` is the BLURT session (or null): Blurt is the primary chain, and
 * votes, notifications, rewards, the editor and the settings all need it. Other chains only add posting/commenting targets.
 */
export const auth = reactive<{ sessions: Record<string, Session>; me: Session | null }>({ sessions: initial, me: initial[PRIMARY] ?? null });
/** Global "open the login dialog" switch (used by vote/comment actions when logged out). */
export const loginOpen = ref(false);

const persist = (): void => {
  try { sessionStorage.setItem(KEY, JSON.stringify(auth.sessions)); } catch { /* ignore */ }
  try {
    // WhaleVault sessions hold no secret (just the account name), so they always persist; keys only when the user opted in
    const keep = Object.fromEntries(Object.entries(auth.sessions).filter(([, s]) => s.remember || s.type === 'wv'));
    if (Object.keys(keep).length) localStorage.setItem(SAVED, JSON.stringify(keep)); else localStorage.removeItem(SAVED);
  } catch { /* ignore */ }
};
export function setSession(chain: ChainId, s: Session | null): void {
  if (s) auth.sessions[chain] = s;
  else if (chain === PRIMARY) for (const k of Object.keys(auth.sessions)) delete auth.sessions[k]; // Blurt is the main account: logging out of it ends every session
  else delete auth.sessions[chain];
  auth.me = auth.sessions[PRIMARY] ?? null;
  persist();
}
export const sessionOf = (chain: string): Session | null => auth.sessions[chain] ?? null;
/** Chains the visitor is currently logged in to, Blurt first. */
export const loggedChains = (): ChainAdapter[] => CHAINS.filter((c) => auth.sessions[c.id]);
export const anyLogin = (): boolean => loggedChains().length > 0;

// ---- WhaleVault: same event protocol as BlurtForum's modules/whalevault.ts ----
interface WVResponse { success: boolean; message?: string; result?: string; request_id?: number }
let wvId = 1;
const wvCb: Record<number, (r: WVResponse) => void> = {};
let wvHandshake: ((ok: boolean) => void) | null = null;

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window) return;
  const d = e.data;
  if (d?.type === 'wvHandshake' && d.response) wvHandshake?.(true);
  else if (d?.type === 'wvResponse' && d.response) {
    const id = d.response.request_id as number;
    wvCb[id]?.(d.response); delete wvCb[id];
  }
});
const wvRequest = (detail: Record<string, unknown>): Promise<WVResponse> =>
  new Promise((resolve) => {
    const id = wvId++; wvCb[id] = resolve;
    document.dispatchEvent(new CustomEvent('wvRequest', { detail: { ...detail, request_id: id } }));
  });
export const wvAvailable = (): Promise<boolean> =>
  new Promise((resolve) => {
    wvHandshake = resolve; setTimeout(() => resolve(false), 1500);
    document.dispatchEvent(new CustomEvent('wvHandshake', { detail: { type: 'wvHandshake', appid: 'blurtdiary', request_id: 0 } }));
  });
export const wvSign = (chain: ChainId, user: string, message: unknown, reason: string) =>
  wvRequest({ type: 'signBuffer', username: adapter(chain).vaultPrefix + user, message, method: 'Posting', reason, sigType: 'hex', appid: 'blurtdiary' });

/** Other chains can only be added on top of a Blurt login (Blurt is the main account). */
const needBlurtFirst = (chain: ChainId): void => { if (chain !== PRIMARY && !auth.sessions[PRIMARY]) throw new Error(t('blurtFirst')); };

export async function loginWhaleVault(chain: ChainId, user: string): Promise<void> {
  needBlurtFirst(chain);
  if (!(await wvAvailable())) throw new Error(t('wvMissing'));
  const r = await wvSign(chain, user, `Login to Blurt Diary as ${user} at ${new Date().toISOString()}`, 'Login');
  if (!r.success) throw new Error(r.message || t('wvError'));
  setSession(chain, { user, type: 'wv', chain });
}

export async function loginKey(chain: ChainId, user: string, key: string, remember = false): Promise<void> {
  needBlurtFirst(chain);
  const a = adapter(chain);
  const pub = dblurt.PrivateKey.from(key).createPublic(a.addressPrefix).toString(); // the key's public form uses the chain's prefix
  const acc = await a.getAccount(user);
  if (!acc) throw new Error(t('accountNotFound', { u: user }));
  if (!acc.posting.key_auths.some((k) => k[0] === pub)) throw new Error(t('keyMismatch'));
  setSession(chain, { user, type: 'key', key, chain, remember });
}

/** Broadcasts `ops` on one chain with that chain's session (defaults to Blurt). */
export async function broadcast(ops: Operation[], chain: ChainId = PRIMARY): Promise<void> {
  const me = auth.sessions[chain];
  if (!me) throw new Error(t('needLogin'));
  const a = adapter(chain);
  if (me.type === 'key') {
    // dblurt is a dhive fork: the address prefix and chain id options make it sign for Hive/Steem as well
    const opts = a.chainId ? { addressPrefix: a.addressPrefix, chainId: a.chainId } : undefined;
    await new dblurt.Client(a.nodes, opts).broadcast.sendOperations(ops as never, dblurt.PrivateKey.from(me.key!));
  } else {
    const r = await wvSign(chain, me.user, { operations: ops, url: a.nodes[0] }, 'bkc_broadcast');
    if (!r.success) throw new Error(r.message || t('wvError'));
  }
}
