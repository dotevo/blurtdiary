/** State of the statistics view: one entry per chain the blog owner has an account on. The fetching itself lives in the chain adapters (`adapter.stats`). */
import { reactive } from 'vue';
import { CHAINS } from './chains';
import type { ChainStats, StatsProgress } from './chains/types';
import { accountOn } from './mirror';

export interface ChainStatsState { status: 'loading' | 'done' | 'error'; account: string; data?: ChainStats; error?: string; progress?: StatsProgress }
export const RANGES = [7, 30, 90, 365];
export const statsState = reactive<{ days: number; chains: Record<string, ChainStatsState> }>({ days: 30, chains: {} });

/** Chains with a known account for the blog owner (Blurt first), in registry order. */
export const statsChains = () => CHAINS.filter((c) => accountOn(c.id));

async function loadChain(id: string, force: boolean): Promise<void> {
  const account = accountOn(id); const a = CHAINS.find((c) => c.id === id);
  if (!account || !a) return;
  const have = statsState.chains[id];
  if (!force && have?.status === 'done' && have.account === account && (have.data?.days ?? 0) >= statsState.days) return; // cached history already covers this range
  if (have?.status === 'loading') return;
  const days = statsState.days;
  statsState.chains[id] = { status: 'loading', account };
  try {
    const data = await a.stats(account, days, (p) => { const s = statsState.chains[id]; if (s) s.progress = p; });
    statsState.chains[id] = { status: 'done', account, data };
  } catch (e) { statsState.chains[id] = { status: 'error', account, error: (e as Error).message || String(e) }; }
}
/** (Re)loads every chain in parallel; chains whose cache already covers the chosen range are skipped. */
export const loadStats = (force = false): Promise<unknown> => Promise.all(statsChains().map((c) => loadChain(c.id, force)));
export const setRange = (days: number): void => { statsState.days = days; void loadStats(); };
export const retryChain = (id: string): Promise<void> => loadChain(id, true);
