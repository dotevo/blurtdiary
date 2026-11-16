/**
 * Balances and recent wallet history of an account, read from the account record and `get_account_history`. The Steem family (Blurt, Hive, Steem, Melek)
 * shares the record layout: `balance`, optionally a dollar token (`sbd_balance` / `hbd_balance` / …), `vesting_shares`, and a vesting fund in the global
 * properties (`total_vesting_fund_<token>`), so one reader serves them all; a chain that differs can still provide its own later.
 */
import type { ChainAccount, ChainAdapter } from './types';

export interface Amount { n: number; symbol: string }
export interface WalletInfo {
  liquid: Amount; dollar: Amount | null; power: Amount;
  /** staked tokens delegated to others / received from others */
  delegatedOut: number; delegatedIn: number;
  /** a power down in progress: tokens per week and when the next part is paid; null = none */
  withdrawing: { weekly: number; next: string } | null;
  /** VESTS per token (to turn a power-down amount into VESTS) */
  vestsPerToken: number;
  savings: Amount | null;
}
export interface HistoryItem { id: number; time: string; kind: 'transfer-in' | 'transfer-out' | 'power-up' | 'power-down' | 'power-paid' | 'claim' | 'delegate' | 'savings' | 'other'; text: string; memo?: string; trx?: string }

const parse = (v: unknown): Amount | null => { const m = /^(-?[\d.]+) ([A-Z]+)$/.exec(String(v ?? '')); return m ? { n: parseFloat(m[1]), symbol: m[2] } : null; };

export async function readWallet(a: ChainAdapter, acc: ChainAccount): Promise<WalletInfo> {
  const g = await a.call<Record<string, string>>('condenser_api', 'get_dynamic_global_properties', []);
  const fundKey = Object.keys(g).find((k) => k.startsWith('total_vesting_fund_')) ?? '';
  const fund = parseFloat(g[fundKey] ?? '0'), shares = parseFloat(g.total_vesting_shares ?? '0');
  const perVests = shares > 0 ? fund / shares : 0; // tokens per VEST
  const toTok = (v: unknown): number => (parseFloat(String(v ?? '0')) || 0) * perVests;
  const liquid = parse(acc.balance) ?? { n: 0, symbol: a.payoutSymbol };
  const dollar = parse(acc.sbd_balance ?? acc.hbd_balance); // the chain's dollar token, when it has one (shown only with a balance)
  const rate = toTok(acc.vesting_withdraw_rate);
  const next = String(acc.next_vesting_withdrawal ?? '');
  const sav = parse(acc.savings_balance);
  return {
    liquid, dollar: dollar && dollar.n > 0 ? dollar : null,
    power: { n: toTok(acc.vesting_shares), symbol: a.powerSymbol },
    delegatedOut: toTok(acc.delegated_vesting_shares), delegatedIn: toTok(acc.received_vesting_shares),
    withdrawing: rate > 0 && !next.startsWith('1969') ? { weekly: rate, next } : null,
    vestsPerToken: perVests > 0 ? 1 / perVests : 0,
    savings: sav && sav.n > 0 ? sav : null,
  };
}

type Row = [number, { op: [string, Record<string, string>]; timestamp: string; trx_id?: string }];
const KINDS = new Set(['transfer', 'transfer_to_vesting', 'withdraw_vesting', 'fill_vesting_withdraw', 'claim_reward_balance', 'delegate_vesting_shares', 'transfer_to_savings', 'transfer_from_savings']);

/** Wallet operations of `account`, newest first. `before` = index of the oldest row already shown (continue below it). */
export async function readHistory(a: ChainAdapter, account: string, tokenPerVests: number, before = -1): Promise<{ items: HistoryItem[]; oldest: number }> {
  const limit = before < 0 ? 200 : Math.min(200, before);
  if (limit <= 0) return { items: [], oldest: 0 };
  const rows = await a.call<Row[]>('condenser_api', 'get_account_history', [account, before, Math.max(0, limit - 1)]);
  const out: HistoryItem[] = [];
  let oldest = before;
  for (const [id, h] of [...rows].reverse()) {
    oldest = oldest < 0 || id < oldest ? id : oldest;
    const [name, d] = h.op; if (!KINDS.has(name)) continue;
    const base = { id, time: h.timestamp.endsWith('Z') ? h.timestamp : h.timestamp + 'Z', trx: h.trx_id };
    const vests = (v: string): string => { const x = parse(v); return x ? `${(x.n * tokenPerVests).toFixed(3)} ${a.powerSymbol}` : v; };
    if (name === 'transfer') {
      const out_ = d.from === account;
      out.push({ ...base, kind: out_ ? 'transfer-out' : 'transfer-in', text: out_ ? `→ @${d.to}: ${d.amount}` : `← @${d.from}: ${d.amount}`, memo: d.memo || undefined });
    } else if (name === 'transfer_to_vesting') out.push({ ...base, kind: 'power-up', text: `${d.amount} → ${a.powerSymbol}${d.to !== account ? ` (@${d.to})` : ''}` });
    else if (name === 'withdraw_vesting') out.push({ ...base, kind: 'power-down', text: parse(d.vesting_shares)?.n === 0 ? '⏹ power down stopped' : `${a.powerSymbol} → ${vests(d.vesting_shares)}` });
    else if (name === 'fill_vesting_withdraw') out.push({ ...base, kind: 'power-paid', text: `${d.deposited}` });
    else if (name === 'claim_reward_balance') out.push({ ...base, kind: 'claim', text: [d.reward_blurt, d.reward_steem, d.reward_hive, d.reward_sbd, d.reward_hbd, d.reward_vests && vests(d.reward_vests)].filter((x) => x && !/^0\.0+ /.test(x)).join(', ') || '0' });
    else if (name === 'delegate_vesting_shares') out.push({ ...base, kind: 'delegate', text: `${d.delegator === account ? '→ @' + d.delegatee : '← @' + d.delegator}: ${vests(d.vesting_shares)}` });
    else out.push({ ...base, kind: 'savings', text: `${name === 'transfer_to_savings' ? '→' : '←'} ${d.amount}` });
  }
  return { items: out, oldest: oldest < 0 ? 0 : oldest };
}
