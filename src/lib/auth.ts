import { reactive, ref } from 'vue';
import * as dblurt from '@beblurt/dblurt';
import { adapter, CHAINS, PRIMARY, type ChainAdapter, type ChainId } from './chains';
import { t } from './i18n';
import { broadcastSteemFamily } from './chains/tx';
import { rpcErrorText } from './chains/jsonrpc';
import { askActiveKey } from './activeKey';
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
/**
 * WhaleVault shows ONE confirmation window at a time: requests sent while another is open are lost (no prompt, no answer – a spinner forever).
 * So the requests go through a queue, one by one, and a request nobody answers ends with an error after 3 minutes.
 */
let wvQueue: Promise<unknown> = Promise.resolve();
const wvRequest = (detail: Record<string, unknown>): Promise<WVResponse> => {
  const run = (): Promise<WVResponse> => new Promise((resolve) => {
    const id = wvId++;
    const timer = setTimeout(() => { delete wvCb[id]; resolve({ success: false, message: t('wvTimeout') }); }, 180000);
    wvCb[id] = (r) => { clearTimeout(timer); resolve(r); };
    // plain data only: Vue's reactive proxies (e.g. beneficiaries read from reactive state) cannot be cloned into the extension – its page script then sees a null `detail`
    document.dispatchEvent(new CustomEvent('wvRequest', { detail: JSON.parse(JSON.stringify({ ...detail, request_id: id })) }));
  });
  const p = wvQueue.then(run, run);
  wvQueue = p.catch(() => undefined);
  return p;
};
export const wvAvailable = (): Promise<boolean> =>
  new Promise((resolve) => {
    wvHandshake = resolve; setTimeout(() => resolve(false), 1500);
    document.dispatchEvent(new CustomEvent('wvHandshake', { detail: { type: 'wvHandshake', appid: 'blurtdiary', request_id: 0 } }));
  });
export const wvSign = (chain: ChainId, user: string, message: unknown, reason: string, method: 'Posting' | 'Active' = 'Posting') => {
  const prefix = adapter(chain).vaultPrefix;
  if (!prefix) return Promise.resolve<WVResponse>({ success: false, message: t('wvUnsupported', { c: adapter(chain).name }) } as WVResponse);
  return wvRequest({ type: 'signBuffer', username: prefix + user, message, method, reason, sigType: 'hex', appid: 'blurtdiary' });
};

/** Text of a failed WhaleVault answer: `message` is a string when the vault itself refuses, but an object when the node's error is passed through ("[object Object]"). */
function vaultError(r: WVResponse): string {
  console.warn('WhaleVault answered with an error', r);
  const x = r as unknown as { message?: unknown; error?: unknown };
  const raw = x.message ?? x.error;
  const text = typeof raw === 'string' ? raw : raw ? rpcErrorText(raw) : '';
  return text || t('wvError');
}

/** Other chains can only be added on top of a Blurt login (Blurt is the main account). */
const needBlurtFirst = (chain: ChainId): void => { if (chain !== PRIMARY && !auth.sessions[PRIMARY]) throw new Error(t('blurtFirst')); };

export async function loginWhaleVault(chain: ChainId, user: string): Promise<void> {
  needBlurtFirst(chain);
  if (!(await wvAvailable())) throw new Error(t('wvMissing'));
  const r = await wvSign(chain, user, `Login to Blurt Diary as ${user} at ${new Date().toISOString()}`, 'Login');
  if (!r.success) throw new Error(vaultError(r));
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
    // Blurt: signed by dblurt. The other chains use their own serializer (dblurt only knows Blurt's operation numbering).
    if (chain !== PRIMARY) await broadcastSteemFamily(a, ops, me.key!); // dblurt serializes Blurt's operation numbering only (see tx.ts)
    else await new dblurt.Client(a.pool.list(), a.chainId ? { addressPrefix: a.addressPrefix, chainId: a.chainId } : undefined).broadcast.sendOperations(ops as never, dblurt.PrivateKey.from(me.key!));
  } else {
    const send = (o: Operation[]): Promise<WVResponse> => wvSign(chain, me.user, { operations: o, url: a.pool.list()[0] }, 'bkc_broadcast');
    const r = await send(ops);
    if (r.success) return;
    const first = vaultError(r);
    // Hive's own JSON writes the beneficiaries as a typed object; if the vault / node did not take the array form, try that once (nothing was sent yet)
    const typed = typedExtensions(chain, ops);
    if (typed && !/cancel|reject|denied|declin|refus/i.test(first)) {
      const r2 = await send(typed);
      if (r2.success) return;
      console.warn('WhaleVault: the typed-extension form failed too', r2);
    }
    throw new Error(first);
  }
}

/** `comment_options` with Hive's typed extension objects instead of `[0, {…}]` pairs; undefined when there is nothing to change. */
function typedExtensions(chain: ChainId, ops: Operation[]): Operation[] | undefined {
  if (chain !== 'hive') return undefined;
  let changed = false;
  const out = ops.map((o): Operation => {
    if (o[0] !== 'comment_options') return o;
    const d = o[1] as { extensions?: unknown[] };
    if (!d.extensions?.some((e) => Array.isArray(e))) return o;
    changed = true;
    return ['comment_options', { ...d, extensions: d.extensions.map((e) => (Array.isArray(e) && e[0] === 0 ? { type: 'comment_payout_beneficiaries', value: e[1] } : e)) }] as Operation;
  });
  return changed ? out : undefined;
}

/**
 * Broadcasts operations that need the ACTIVE authority (transfers, power up / down). The posting key of a session cannot sign them, and no other key is ever
 * kept: with WhaleVault the vault signs (and asks the user); otherwise the user is asked for the active key each time, it is checked against the account's
 * active authority, used for this one transaction and dropped.
 */
export async function broadcastActive(ops: Operation[], chain: ChainId, summary: string): Promise<void> {
  const me = auth.sessions[chain];
  if (!me) throw new Error(t('needLogin'));
  const a = adapter(chain);
  if (me.type === 'wv') {
    const r = await wvSign(chain, me.user, { operations: ops, url: a.pool.list()[0] }, 'bkc_broadcast', 'Active');
    if (!r.success) throw new Error(vaultError(r));
    return;
  }
  let key = await askActiveKey(chain, me.user, summary);
  try {
    const priv = dblurt.PrivateKey.from(key.trim());
    key = '';
    const pub = priv.createPublic(a.addressPrefix).toString();
    const acc = await a.getAccount(me.user);
    if (!acc) throw new Error(t('accountNotFound', { u: me.user }));
    if (!acc.active.key_auths.some((k) => k[0] === pub)) throw new Error(t(acc.posting.key_auths.some((k) => k[0] === pub) ? 'keyIsPosting' : 'keyNotActive'));
    if (chain !== PRIMARY || ops.some((o) => o[0] === 'withdraw_vesting')) await broadcastSteemFamily(a, ops, priv);
    else await new dblurt.Client(a.pool.list(), a.chainId ? { addressPrefix: a.addressPrefix, chainId: a.chainId } : undefined).broadcast.sendOperations(ops as never, priv);
  } finally { key = ''; }
}
