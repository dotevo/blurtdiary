/**
 * Melek (Blurt fork). Key login only for now: WhaleVault has no Melek support yet.
 * When it does, set `vaultPrefix` below – that is the only change needed, the login button appears by itself.
 * Unverified assumptions are marked "(?)"; the rest is derived from the account record so unknown field names do not break it.
 */
import { firstPosts, viaBlog, viaAuthorDate, viaHistory } from './posts';
import { commentOptions } from '../ben';
import type { Post } from '../types';
import { joinParts, num, votingPowerPct } from './account';
import { collectStats } from './stats';
import { isMissingError, jsonRpc } from './jsonrpc';
import { NodePool } from './nodes';
import { resolveThread } from './thread';
import type { ChainAccount, ChainAdapter } from './types';

export const MELEK_NODES = ['https://melek.salon/rpc'];
export const MELEK_POOL = new NodePool('melek', MELEK_NODES, true, 6000);

/** Reward fields of an account: every `reward_<x>_balance` is claimed as `reward_<x>`, vesting as `reward_vests`. */
const rewardKeys = (acc: ChainAccount): string[] =>
  Object.keys(acc).filter((k) => /^reward_.+_balance$/.test(k) && k !== 'reward_vesting_balance');

export const melek: ChainAdapter = {
  id: 'melek', name: 'Melek', letter: 'M', color: '#8e44ad', symbol: 'MELEK', payoutSymbol: 'MELEK',
  addressPrefix: 'MELEK', chainId: '907959e559e253f0db275e467363425cc2cf4f20f7721699914d248a5547ad8b', pool: MELEK_POOL,
  devAccount: undefined, // no tip account on this chain
  vaultPrefix: undefined, // TODO: WhaleVault prefix for Melek once supported (key login only until then)
  powerSymbol: 'MP',
  imageHost: undefined, imageHosts: [],

  postUrl: (author, permlink) => `https://melek.salon/@${author}/${permlink}`, // (?)
  call: (api, method, params) => jsonRpc(MELEK_POOL, api, method, params, 'modern'),

  async getAccount(name) {
    const [acc] = await melek.call<ChainAccount[]>('condenser_api', 'get_accounts', [[name]]);
    return acc ?? null;
  },
  walletUrl: (user) => `https://witness.melek.salon/wallet?account=${user}`, // (?)
  votingPower: votingPowerPct,
  rewards(acc) {
    const parts: [number, string][] = rewardKeys(acc).map((k) => [num(acc[k]), String(acc[k] ?? '').split(' ')[1] ?? k.replace(/^reward_|_balance$/g, '').toUpperCase()]);
    const vests = num(acc.reward_vesting_balance);
    const power = num(acc.reward_vesting_melek ?? acc.reward_vesting_blurt ?? 0);
    return { has: vests > 0 || parts.some(([n]) => n > 0), label: joinParts([...parts, [power, 'MP']]), power: power.toFixed(3) };
  },
  claimOp(account, acc) {
    const op: Record<string, unknown> = { account };
    for (const k of rewardKeys(acc)) op[k.replace(/_balance$/, '')] = acc[k];
    op.reward_vests = acc.reward_vesting_balance ?? '0.000000 VESTS';
    return ['claim_reward_balance', op];
  },
  async getContent(author, permlink) {
    const p = await melek.call<Post>('condenser_api', 'get_content', [author, permlink]).catch((e) => { if (isMissingError(e)) return null; throw e; });
    return p?.author ? p : null;
  },
  // no bridge API: the discussion call is skipped and the thread is walked with get_content_replies
  getThread: (author, permlink) => resolveThread(melek, author, permlink, async () => null, true),

  latestPosts: (account) => firstPosts(melek, account, [viaBlog, viaAuthorDate, viaHistory()]),
  stats: (account, days, onProgress) => collectStats(melek, account, days, onProgress),
  beneficiaries: () => [],
  commentOptions: (author, permlink, beneficiaries, maxPayout = '1000000.000 MELEK') => commentOptions(author, permlink, beneficiaries, maxPayout), // (?) Blurt-style op
};
