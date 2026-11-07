/**
 * Blurt – the PRIMARY chain: category listings, search, notifications, rewards and votes all go here.
 * bridge.* needs a node with the extended (hivemind-style) API; rpc.blurt.blog serves only the official API.
 */
import { feedBridge, feedCondenser, firstList, recentReplies, repliesBridge, repliesScan, accBlog, accBridge, firstPosts, tagBridge, tagCondenser, viaBridge, viaBlog, viaAuthorDate } from './posts';
import { APP_DEV, COMMUNITY_WEIGHT, commentOptions as blurtCommentOptions, communityOf, DEV_WEIGHT, sortBens } from '../ben';
import type { Beneficiary, Post } from '../types';
import { joinParts, num, votingPowerPct } from './account';
import { collectStats } from './stats';
import { jsonRpc } from './jsonrpc';
import { NodePool } from './nodes';
import { resolveThread } from './thread';
import type { ChainAccount, ChainAdapter } from './types';

export const BRIDGE_NODES = ['https://rpc.drakernoise.com', 'https://blurtrpc.dagobert.uk', 'https://rpc.beblurt.com'];
export const ALL_NODES = [...BRIDGE_NODES, 'https://rpc.blurt.blog'];
// fixed order (not adaptive): not every node serves every API, so a failure must not reshuffle which node is asked for what
const BRIDGE_POOL = new NodePool('blurt', BRIDGE_NODES, false, 7000);
const ALL_POOL = new NodePool('blurt', ALL_NODES, false, 7000);

export const blurt: ChainAdapter = {
  id: 'blurt', name: 'Blurt', letter: 'B', color: '#e4572e', symbol: 'BLURT', payoutSymbol: 'BLURT',
  addressPrefix: 'BLT', chainId: undefined /* dblurt default */, pool: ALL_POOL, devAccount: APP_DEV, vaultPrefix: 'blt:', powerSymbol: 'BP',
  imageHost: 'https://img-upload.blurt.blog', imageHosts: ['images.blurt.blog', 'img-upload.blurt.blog'],

  postUrl: (author, permlink) => `https://blurt.blog/@${author}/${permlink}`,
  call: (api, method, params) => jsonRpc(api === 'bridge' ? BRIDGE_POOL : ALL_POOL, api, method, params),

  async getAccount(name) {
    const [acc] = await blurt.call<ChainAccount[]>('condenser_api', 'get_accounts', [[name]]);
    return acc ?? null;
  },
  walletUrl: (user) => `https://blurtwallet.com/@${user}`,
  votingPower: votingPowerPct,
  rewards(acc) {
    const liquid = num(acc.reward_blurt_balance), vests = num(acc.reward_vesting_balance), power = num(acc.reward_vesting_blurt);
    return { has: liquid > 0 || vests > 0, label: joinParts([[liquid, 'BLURT'], [power, 'BP']]), power: power.toFixed(3) };
  },
  claimOp: (account, acc) => ['claim_reward_balance', { account, reward_blurt: acc.reward_blurt_balance ?? '0.000 BLURT', reward_vests: acc.reward_vesting_balance ?? '0.000000 VESTS' }],
  async getContent(author, permlink) {
    const p = await blurt.call<Post>('condenser_api', 'get_content', [author, permlink]);
    return p?.author ? p : null; // an unknown post comes back with an empty author
  },
  // ONE request returns the post and its whole comment tree (all levels)
  getThread: (author, permlink) => resolveThread(blurt, author, permlink, () => blurt.call<Record<string, Post>>('bridge', 'get_discussion', { author, permlink })),

  /** community 3% (thread in a blurt-NNNNNN community) + app author 1% (optional) */
  feedPosts: (account, cur = {}) => firstList(blurt, account, cur, [feedBridge, feedCondenser]),
  recentReplies: (account) => recentReplies(blurt, account, [repliesBridge, repliesScan]),
  accountPosts: (account, cur = {}) => firstList(blurt, account, cur, [accBridge, accBlog]),
  tagPosts: (tag, cur = {}, sort = 'created') => firstList(blurt, { tag, sort }, cur, [tagBridge, tagCondenser]),
  latestPosts: (account) => firstPosts(blurt, account, [viaBridge, viaBlog, viaAuthorDate]),
  stats: (account, days, onProgress) => collectStats(blurt, account, days, onProgress),
  beneficiaries(author, parent, tip) {
    const bens: Beneficiary[] = [];
    const community = communityOf(parent);
    if (community && community !== author) bens.push({ account: community, weight: COMMUNITY_WEIGHT });
    if (tip && author !== APP_DEV) bens.push({ account: APP_DEV, weight: DEV_WEIGHT });
    return sortBens(bens);
  },
  commentOptions: (author, permlink, bens, maxPayout) => blurtCommentOptions(author, permlink, bens, maxPayout),
};
