/**
 * Earnings statistics from an account's history - shared by every chain adapter.
 *
 * Nothing here is chain specific. The reward operations (author_reward, curation_reward, comment_benefactor_reward) exist on every
 * chain of this family, and the amounts are recognised by their SYMBOL, not by field names (those differ: hive_payout, steem_payout,
 * blurt_payout ...): the chain's own token = liquid reward, its dollar-like token (HBD/SBD, when the chain has one) = `debt`, and
 * VESTS (staked rewards) are converted to the chain token with the current vesting ratio. So a NEW chain only has to expose
 * `symbol`, `payoutSymbol` and `call` and can use `collectStats(...)` as its `stats` method unchanged; a chain with a different
 * history API implements `stats` itself and returns the same ChainStats shape.
 */
import type { ChainAdapter, ChainStats, StatPoint, StatsProgress } from './types';

const PAGE = 1000;       // the maximum a node returns per get_account_history call
const MAX_PAGES = 30;    // safety valve: 30 000 operations per chain, then the result says "older data not scanned"
const KIND: Record<string, 'author' | 'curation' | 'benefactor'> = {
  author_reward: 'author', curation_reward: 'curation', comment_benefactor_reward: 'benefactor',
};
const ASSET = /^(-?\d+(?:\.\d+)?) ([A-Z0-9]+)$/;
const dayOf = (iso: string): string => iso.slice(0, 10);
const zero = (day: string): StatPoint => ({ day, author: 0, curation: 0, benefactor: 0, debt: 0 });

type Hist = [number, { op: [string, Record<string, unknown>]; timestamp: string }];
type Source = Pick<ChainAdapter, 'id' | 'symbol' | 'payoutSymbol' | 'call'>;

/** Tokens per VEST from the global properties (the field that holds the vesting fund is named per chain: total_vesting_fund_hive ...). */
async function vestRatio(a: Source): Promise<number> {
  try {
    const g = await a.call<Record<string, unknown>>('condenser_api', 'get_dynamic_global_properties', []);
    const key = Object.keys(g).find((k) => k.startsWith('total_vesting_fund_'));
    const fund = parseFloat(String(g[key ?? ''] ?? '')), shares = parseFloat(String(g.total_vesting_shares ?? ''));
    return fund > 0 && shares > 0 ? fund / shares : 0;
  } catch { return 0; }
}

export async function collectStats(a: Source, account: string, days: number, onProgress?: (p: StatsProgress) => void): Promise<ChainStats> {
  const since = new Date(Date.now() - days * 86400000), sinceDay = since.toISOString().slice(0, 10);
  const ratio = await vestRatio(a);
  const byDay = new Map<string, StatPoint>();
  let scanned = 0, reached = '', start = -1, limit = PAGE, complete = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await a.call<Hist[]>('condenser_api', 'get_account_history', [account, start, limit]);
    if (!rows?.length) { complete = true; break; }
    scanned += rows.length;
    for (const [, h] of rows) {
      const day = dayOf(h.timestamp);
      if (day < sinceDay) continue;
      const kind = KIND[h.op?.[0]]; if (!kind) continue;
      const p = byDay.get(day) ?? zero(day); byDay.set(day, p);
      for (const v of Object.values(h.op[1])) {
        const m = typeof v === 'string' ? v.match(ASSET) : null; if (!m) continue;
        const n = parseFloat(m[1]);
        if (m[2] === a.symbol) p[kind] += n;
        else if (m[2] === 'VESTS') p[kind] += n * ratio;
        else if (m[2] === a.payoutSymbol) p.debt += n;
      }
    }
    const first = rows[0][0]; reached = dayOf(rows[0][1].timestamp);
    onProgress?.({ scanned, reached });
    if (first <= 0 || reached < sinceDay) { complete = true; break; }
    start = first - 1; limit = Math.min(PAGE, start);
    if (start < 0) { complete = true; break; }
  }

  // one point per day, also the empty ones, so the chart keeps its time axis
  const points: StatPoint[] = [];
  for (let d = new Date(sinceDay + 'T00:00:00Z'); d.getTime() <= Date.now(); d = new Date(d.getTime() + 86400000)) {
    const k = d.toISOString().slice(0, 10); points.push(byDay.get(k) ?? zero(k));
  }
  const totals = points.reduce((s, p) => ({ author: s.author + p.author, curation: s.curation + p.curation, benefactor: s.benefactor + p.benefactor, debt: s.debt + p.debt }),
    { author: 0, curation: 0, benefactor: 0, debt: 0 });
  return { chain: a.id, account, days, unit: a.symbol, debtUnit: a.payoutSymbol !== a.symbol ? a.payoutSymbol : undefined, points, totals, scanned, from: reached || null, complete, vestsConverted: ratio > 0 };
}
