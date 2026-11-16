import { reactive } from 'vue';
import { auth, broadcast, loggedChains } from './auth';
import { adapter } from './chains';
import type { ChainAccount } from './chains/types';
import type { Operation } from './types';
import { t } from './i18n';
import { toast } from './toast';

/** Wallet page of an account on a chain (transfers, power up/down … live there; we only link to it). */
export const walletUrl = (user: string, chain = 'blurt'): string => adapter(chain).walletUrl(user);

/** Per-chain state of the logged-in account: voting power and pending rewards. */
export interface ChainWallet { vp: number | null; has: boolean; label: string; power: string; busy: boolean }
export const wallets = reactive<Record<string, ChainWallet>>({});
const accounts: Record<string, ChainAccount> = {}; // raw records, needed to build the claim operation

export async function loadWallet(chain: string): Promise<void> {
  const me = auth.sessions[chain]?.user; if (!me) return;
  try {
    const a = adapter(chain);
    const acc = await a.getAccount(me); if (!acc) return;
    accounts[chain] = acc;
    const r = a.rewards(acc);
    wallets[chain] = { vp: a.votingPower(acc), has: r.has, label: r.label, power: r.power, busy: false };
  } catch (e) { console.warn('wallet', chain, e); }
}
/** Loads every logged-in chain in parallel. */
export const loadWallets = (): Promise<unknown> => Promise.all(loggedChains().map((c) => loadWallet(c.id)));

export async function claim(chain: string): Promise<void> {
  const me = auth.sessions[chain]?.user, w = wallets[chain], acc = accounts[chain];
  if (!me || !w || !acc || w.busy) return;
  w.busy = true;
  try {
    await broadcast([adapter(chain).claimOp(me, acc)], chain);
    w.has = false; toast(t('claimed'));
  } catch (e) { toast((e as Error).message || t('claimFailed')); }
  w.busy = false;
}

// ---------- the wallet page: balances, history, transfer, power up / down ----------
import { broadcastActive } from './auth';
import { readHistory, readWallet, type HistoryItem, type WalletInfo } from './chains/walletinfo';

interface WalletPage { info: WalletInfo | null; hist: HistoryItem[]; oldest: number; moreHist: boolean; loading: boolean; histLoading: boolean; error: string; busy: boolean }
export const wpage = reactive<Record<string, WalletPage>>({});
const page = (chain: string): WalletPage => { wpage[chain] ??= { info: null, hist: [], oldest: -1, moreHist: true, loading: false, histLoading: false, error: '', busy: false }; return wpage[chain]; }; // read back through the reactive proxy

export async function loadWalletPage(chain: string): Promise<void> {
  const me = auth.sessions[chain]?.user; if (!me) return;
  const w = page(chain); w.loading = true; w.error = '';
  try {
    const a = adapter(chain); const acc = await a.getAccount(me);
    if (!acc) throw new Error(t('accountNotFound', { u: me }));
    w.info = await readWallet(a, acc);
    void loadWallet(chain); // pending rewards + the claim button
  } catch (e) { w.error = (e as Error).message || 'error'; }
  w.loading = false;
}
/** Recent wallet operations; `more` continues below the oldest one shown. */
export async function loadHistoryPage(chain: string, more = false): Promise<void> {
  const me = auth.sessions[chain]?.user; const w = page(chain); if (!me || w.histLoading) return;
  w.histLoading = true;
  try {
    if (!w.info) await loadWalletPage(chain);
    const tpv = w.info && w.info.vestsPerToken > 0 ? 1 / w.info.vestsPerToken : 0;
    let before = more ? w.oldest - 1 : -1; const got: HistoryItem[] = [];
    for (let i = 0; i < 5 && got.length < 20; i++) { // sparse accounts: keep reading older pages until there is something to show
      const r = await readHistory(adapter(chain), me, tpv, before);
      got.push(...r.items); w.oldest = r.oldest; before = r.oldest - 1;
      if (r.oldest <= 0) { w.moreHist = false; break; }
    }
    w.hist = more ? [...w.hist, ...got] : got;
  } catch (e) { w.error = (e as Error).message || 'error'; }
  w.histLoading = false;
}

const amt = (n: number, symbol: string): string => `${n.toFixed(3)} ${symbol}`;
const valid = (n: number): boolean => Number.isFinite(n) && n > 0;
async function run(chain: string, ops: Operation[], summary: string): Promise<boolean> {
  const w = page(chain); if (w.busy) return false;
  w.busy = true;
  try { await broadcastActive(ops, chain, summary); return true; }
  catch (e) { const m = (e as Error).message; if (m !== 'cancelled') toast(m || t('walletFailed')); return false; }
  finally { w.busy = false; }
}
const after = async (chain: string): Promise<void> => { await new Promise((r) => setTimeout(r, 3500)); await loadWalletPage(chain); await loadHistoryPage(chain); }; // a block is 3 s

/** Transfer of the liquid token or of the dollar token. Returns true when sent. */
export async function sendTransfer(chain: string, to: string, n: number, symbol: string, memo: string): Promise<boolean> {
  const me = auth.sessions[chain]?.user; const w = page(chain);
  const dest = to.trim().toLowerCase().replace(/^@/, '');
  if (!me || !w.info) return false;
  if (!dest || !valid(n)) { toast(t('walletBadInput')); return false; }
  const have = symbol === w.info.liquid.symbol ? w.info.liquid.n : w.info.dollar?.symbol === symbol ? w.info.dollar.n : 0;
  if (n > have + 1e-9) { toast(t('walletNotEnough')); return false; }
  if (!(await adapter(chain).getAccount(dest))) { toast(t('accountNotFound', { u: dest })); return false; }
  const ok = await run(chain, [['transfer', { from: me, to: dest, amount: amt(n, symbol), memo }]], t('sumTransfer', { a: amt(n, symbol), to: dest, c: adapter(chain).name }));
  if (ok) { toast(t('walletSent')); void after(chain); }
  return ok;
}
export async function powerUp(chain: string, n: number): Promise<boolean> {
  const me = auth.sessions[chain]?.user; const w = page(chain);
  if (!me || !w.info) return false;
  if (!valid(n)) { toast(t('walletBadInput')); return false; }
  if (n > w.info.liquid.n + 1e-9) { toast(t('walletNotEnough')); return false; }
  const ok = await run(chain, [['transfer_to_vesting', { from: me, to: me, amount: amt(n, w.info.liquid.symbol) }]], t('sumPowerUp', { a: amt(n, w.info.liquid.symbol), c: adapter(chain).name }));
  if (ok) { toast(t('walletSent')); void after(chain); }
  return ok;
}
/** Starts a power down of `n` tokens of staked power (`0` stops a running one). */
export async function powerDown(chain: string, n: number): Promise<boolean> {
  const me = auth.sessions[chain]?.user; const w = page(chain);
  if (!me || !w.info || w.info.vestsPerToken <= 0) return false;
  if (!(n >= 0) || !Number.isFinite(n)) { toast(t('walletBadInput')); return false; }
  if (n > w.info.power.n - w.info.delegatedOut + 1e-9) { toast(t('walletNotEnough')); return false; }
  const vests = `${(n * w.info.vestsPerToken).toFixed(6)} VESTS`;
  const ok = await run(chain, [['withdraw_vesting', { account: me, vesting_shares: vests }]], n === 0 ? t('sumPowerStop', { c: adapter(chain).name }) : t('sumPowerDown', { a: amt(n, w.info.power.symbol), c: adapter(chain).name }));
  if (ok) { toast(t('walletSent')); void after(chain); }
  return ok;
}
