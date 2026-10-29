import { reactive } from 'vue';
import { auth, broadcast, loggedChains } from './auth';
import { adapter } from './chains';
import type { ChainAccount } from './chains/types';
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
