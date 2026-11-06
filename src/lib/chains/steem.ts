/**
 * Steem. The oldest of the family: STEEM/SBD assets and `percent_steem_dollars`. For the discussion we use
 * condenser_api.get_state (supported by every steemd node) instead of the bridge API, which is not available everywhere.
 */
import { firstPosts, viaBlog, viaAuthorDate, viaHistory } from './posts';
import { APP_DEV, DEV_WEIGHT, sortBens } from '../ben';
import type { Post } from '../types';
import { joinParts, num, votingPowerPct } from './account';
import { collectStats } from './stats';
import { isMissingError, jsonRpc } from './jsonrpc';
import { NodePool } from './nodes';
import { resolveThread } from './thread';
import type { ChainAccount, ChainAdapter } from './types';

export const STEEM_NODES = ['https://api.steemit.com', 'https://api.moecki.online', 'https://steemd.steemworld.org'];
/** Adaptive: a silent node drops to the end of the queue, the one that answered is asked first next time. */
export const STEEM_POOL = new NodePool('steem', STEEM_NODES, true, 5000);

export const steem: ChainAdapter = {
  id: 'steem', name: 'Steem', letter: 'S', color: '#2f80ed', symbol: 'STEEM', payoutSymbol: 'SBD',
  addressPrefix: 'STM', chainId: '0000000000000000000000000000000000000000000000000000000000000000', pool: STEEM_POOL,
  devAccount: APP_DEV, // the app author's account on Steem (optional 1% tip, same switch as on Blurt)
  vaultPrefix: 'stm:', powerSymbol: 'SP',
  imageHost: 'https://steemitimages.com', imageHosts: ['steemitimages.com', 'cdn.steemitimages.com'],

  postUrl: (author, permlink) => `https://steemit.com/@${author}/${permlink}`,
  call: (api, method, params) => jsonRpc(STEEM_POOL, api, method, params, 'modern'),

  async getAccount(name) {
    const [acc] = await steem.call<ChainAccount[]>('condenser_api', 'get_accounts', [[name]]);
    return acc ?? null;
  },
  walletUrl: (user) => `https://steemitwallet.com/@${user}`,
  votingPower: votingPowerPct,
  rewards(acc) {
    const steem_ = num(acc.reward_steem_balance), sbd = num(acc.reward_sbd_balance), vests = num(acc.reward_vesting_balance), power = num(acc.reward_vesting_steem);
    return { has: steem_ > 0 || sbd > 0 || vests > 0, label: joinParts([[steem_, 'STEEM'], [sbd, 'SBD'], [power, 'SP']]), power: power.toFixed(3) };
  },
  claimOp: (account, acc) => ['claim_reward_balance', { account, reward_steem: acc.reward_steem_balance ?? '0.000 STEEM', reward_sbd: acc.reward_sbd_balance ?? '0.000 SBD', reward_vests: acc.reward_vesting_balance ?? '0.000000 VESTS' }],
  async getContent(author, permlink) {
    const p = await steem.call<Post>('condenser_api', 'get_content', [author, permlink]).catch((e) => { if (isMissingError(e)) return null; throw e; });
    return p?.author ? p : null;
  },
  // get_state returns { content: { "author/permlink": post, … } } for the whole discussion
  getThread: (author, permlink) => resolveThread(steem, author, permlink, async () =>
    (await steem.call<{ content?: Record<string, Post> }>('condenser_api', 'get_state', [`/tag/@${author}/${permlink}`])).content, true),

  latestPosts: (account) => firstPosts(steem, account, [viaBlog, viaAuthorDate, viaHistory()]),
  stats: (account, days, onProgress) => collectStats(steem, account, days, onProgress),
  beneficiaries: (author, _parent, tip) => (tip && steem.devAccount && author !== steem.devAccount ? sortBens([{ account: steem.devAccount, weight: DEV_WEIGHT }]) : []),
  commentOptions: (author, permlink, beneficiaries, maxPayout = '1000000.000 SBD') => ['comment_options', {
    author, permlink, max_accepted_payout: maxPayout, percent_steem_dollars: 10000, allow_votes: true, allow_curation_rewards: true,
    extensions: beneficiaries.length ? [[0, { beneficiaries }]] : [],
  }],
};
