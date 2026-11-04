/**
 * Hive. Same JSON-RPC shapes as Blurt for the calls we use, but: HIVE/HBD assets, `percent_hbd`, chain id and the
 * STM key prefix. Communities (`hive-NNNNNN`) are a different namespace than Blurt's, so no community beneficiary is added.
 */
import { APP_DEV, DEV_WEIGHT, sortBens } from '../ben';
import type { Post } from '../types';
import { joinParts, num, votingPowerPct } from './account';
import { isMissingError, jsonRpc } from './jsonrpc';
import { NodePool } from './nodes';
import { resolveThread } from './thread';
import type { ChainAccount, ChainAdapter } from './types';

export const HIVE_NODES = ['https://api.hive.blog', 'https://api.openhive.network', 'https://api.deathwing.me', 'https://hive-api.arcange.eu', 'https://anyx.io'];
/** Adaptive: a silent node drops to the end of the queue, the one that answered is asked first next time. */
export const HIVE_POOL = new NodePool('hive', HIVE_NODES, true, 5000);

export const hive: ChainAdapter = {
  id: 'hive', name: 'Hive', letter: 'H', color: '#e31337', symbol: 'HIVE', payoutSymbol: 'HBD',
  addressPrefix: 'STM', chainId: 'beeab0de00000000000000000000000000000000000000000000000000000000', pool: HIVE_POOL,
  devAccount: APP_DEV, // the app author's account on Hive (optional 1% tip, same switch as on Blurt)
  vaultPrefix: 'hiv:', powerSymbol: 'HP',
  imageHost: 'https://images.hive.blog', imageHosts: ['images.hive.blog', 'images.ecency.com'],

  postUrl: (author, permlink) => `https://peakd.com/@${author}/${permlink}`,
  call: (api, method, params) => jsonRpc(HIVE_POOL, api, method, params, 'modern'),

  async getAccount(name) {
    const [acc] = await hive.call<ChainAccount[]>('condenser_api', 'get_accounts', [[name]]);
    return acc ?? null;
  },
  walletUrl: (user) => `https://wallet.hive.blog/@${user}`,
  votingPower: votingPowerPct,
  rewards(acc) {
    const hive_ = num(acc.reward_hive_balance), hbd = num(acc.reward_hbd_balance), vests = num(acc.reward_vesting_balance), power = num(acc.reward_vesting_hive);
    return { has: hive_ > 0 || hbd > 0 || vests > 0, label: joinParts([[hive_, 'HIVE'], [hbd, 'HBD'], [power, 'HP']]), power: power.toFixed(3) };
  },
  claimOp: (account, acc) => ['claim_reward_balance', { account, reward_hive: acc.reward_hive_balance ?? '0.000 HIVE', reward_hbd: acc.reward_hbd_balance ?? '0.000 HBD', reward_vests: acc.reward_vesting_balance ?? '0.000000 VESTS' }],
  async getContent(author, permlink) {
    const p = await hive.call<Post>('condenser_api', 'get_content', [author, permlink]).catch((e) => { if (isMissingError(e)) return null; throw e; });
    return p?.author ? p : null;
  },
  // Hive has the bridge API on its public nodes; `observer` is required by some of them
  getThread: (author, permlink) => resolveThread(hive, author, permlink, () => hive.call<Record<string, Post>>('bridge', 'get_discussion', { author, permlink, observer: '' }), true),

  beneficiaries: (author, _parent, tip) => (tip && hive.devAccount && author !== hive.devAccount ? sortBens([{ account: hive.devAccount, weight: DEV_WEIGHT }]) : []),
  commentOptions: (author, permlink, beneficiaries, maxPayout = '1000000.000 HBD') => ['comment_options', {
    author, permlink, max_accepted_payout: maxPayout, percent_hbd: 10000, allow_votes: true, allow_curation_rewards: true,
    extensions: beneficiaries.length ? [[0, { beneficiaries }]] : [],
  }],
};
