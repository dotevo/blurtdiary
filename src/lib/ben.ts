import { devTip } from './settings';
import type { Beneficiary, Operation, Post } from './types';

/** Account that receives the app-author share on every comment/post made through this site. */
export const APP_DEV = 'dotevo';
export const DEV_WEIGHT = 100;        // 1%
export const COMMUNITY_WEIGHT = 300;  // 3%

/** Community account of a thread (`blurt-123456`), taken from the parent post/comment. */
export const communityOf = (p: Post): string | undefined => {
  const c = p.community_name ?? p.category;
  return c && /^blurt-\d+$/.test(c) ? c : undefined; // communities are blurt-<number>; a tag like "blurt-diary" is not one
};

/** Same rules as BlurtForum's prepareBeneficiaries: community 3% (if the thread is in one) + app author 1%. */
export function beneficiariesFor(author: string, parent: Post, tip: boolean = devTip.value): Beneficiary[] {
  const bens: Beneficiary[] = [];
  const community = communityOf(parent);
  if (community && community !== author) bens.push({ account: community, weight: COMMUNITY_WEIGHT });
  if (tip && author !== APP_DEV) bens.push({ account: APP_DEV, weight: DEV_WEIGHT });
  return sortBens(bens);
}
/** The chain requires beneficiaries sorted by account name (plain byte order, not locale order). */
export const sortBens = (b: Beneficiary[]): Beneficiary[] => [...b].sort((x, y) => (x.account < y.account ? -1 : x.account > y.account ? 1 : 0));
export const benLabel = (b: Beneficiary[]): string => b.map((x) => `@${x.account} ${x.weight / 100}%`).join(', ');

export const commentOptions = (author: string, permlink: string, beneficiaries: Beneficiary[], maxPayout = '1000000.000 BLURT'): Operation => ['comment_options', {
  author, permlink, max_accepted_payout: maxPayout, percent_steem_dollars: 10000, allow_votes: true, allow_curation_rewards: true,
  extensions: beneficiaries.length ? [[0, { beneficiaries }]] : [],
}];
