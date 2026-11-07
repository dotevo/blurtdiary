import type { Beneficiary, Operation, Post } from '../types';
import type { Cursor, Sort } from './posts';
import type { NodePool } from './nodes';

/** Identifier of a supported blockchain: 'blurt' (primary), 'hive', 'steem'. The registry in index.ts is the source of truth. */
export type ChainId = string;

/** Account record as returned by `condenser_api.get_accounts` (field names differ a little per chain). */
export type ChainAccount = { posting: { key_auths: [string, number][] } } & Record<string, unknown>;
/** Pending (unclaimed) rewards of an account. */
export interface RewardInfo { has: boolean; label: string; power: string }

/** Rewards of one day (amounts in the chain's token; `debt` in its dollar-like token HBD/SBD when it has one). */
export interface StatPoint { day: string; author: number; curation: number; benefactor: number; debt: number }
/** Earnings of one account on one chain over the last `days` days. */
export interface ChainStats {
  chain: ChainId; account: string; days: number;
  /** Token the amounts are in (BLURT, HIVE, STEEM ...) and the dollar-like one for `debt` (absent when the chain has none). */
  unit: string; debtUnit?: string;
  points: StatPoint[]; totals: Omit<StatPoint, 'day'>;
  /** Operations looked at, how far back the history was read, and whether it reached the start of the period. */
  scanned: number; from: string | null; complete: boolean;
  /** Staked (VESTS) rewards were converted with the current vesting ratio. */
  vestsConverted: boolean;
}
export interface StatsProgress { scanned: number; reached: string }

/** Result of looking a post up on one chain. */
export type MirrorStatus = 'loading' | 'found' | 'missing' | 'error';

/**
 * One chain's view of a post's discussion.
 *  - `found`:   the node answered and the post exists
 *  - `missing`: the node answered and the post does NOT exist (a definitive "not published here")
 *  - `error`:   no node could be reached / answered garbage (we do NOT know whether the post exists)
 */
export interface ChainThread {
  chain: ChainId;
  status: MirrorStatus;
  root?: Post;
  /** "author/permlink" of a post -> its direct replies, as stored on this chain. */
  kids: Record<string, Post[]>;
  error?: string;
}

/**
 * Everything that differs between blockchains lives behind this interface, one implementation per file
 * (blurt.ts, hive.ts, steem.ts). The rest of the app never talks to a node directly.
 */
export interface ChainAdapter {
  id: ChainId;
  name: string;
  /** One-letter label used in badges. */
  letter: string;
  /** Badge colour (kept readable on light and dark backgrounds). */
  color: string;
  /** Native token symbol (BLURT, HIVE, STEEM) – used in payout labels. */
  symbol: string;
  /** Unit in which post/comment rewards are shown (Hive/Steem report the dollar-valued HBD/SBD, Blurt BLURT). */
  payoutSymbol: string;
  /** Key prefix of public keys on this chain (BLT / STM). */
  addressPrefix: string;
  /** Hex chain id used when signing transactions; undefined = the dblurt default (Blurt). */
  chainId?: string;
  /** Node queue used for broadcasting and for plain (condenser_api) calls (see nodes.ts). */
  pool: NodePool;
  /** Account that receives the optional app-author tip on this chain (none = no tip is requested). */
  devAccount?: string;
  /** Prefix WhaleVault expects in `username` for this chain; undefined = WhaleVault not supported (key login only). */
  vaultPrefix?: string;
  /** Label of the staked token (BP / HP / SP) – shown with pending rewards. */
  powerSymbol: string;
  /** Image host that accepts `POST <host>/<account>/<signature>` uploads (same signing scheme on all chains); none = no upload. */
  imageHost?: string;
  /** Hosts whose images count as "already hosted on this chain" (so they are not re-uploaded when mirroring). */
  imageHosts: string[];

  /** Public web page of a post (opened from the badges). */
  postUrl(author: string, permlink: string): string;
  /** Raw JSON-RPC call. `bridge` uses direct method names, everything else goes through the condenser-style `call` wrapper. */
  call<T = unknown>(api: string, method: string, params: unknown): Promise<T>;
  /** Full account record (also used to verify a key against the posting authority) or null when the account does not exist. */
  getAccount(name: string): Promise<ChainAccount | null>;
  /** Wallet page of an account. */
  walletUrl(user: string): string;
  /** Current voting power in percent, or null when unknown. */
  votingPower(acc: ChainAccount): number | null;
  /** Pending rewards (the reward field names are chain specific). */
  rewards(acc: ChainAccount): RewardInfo;
  /** The `claim_reward_balance` operation for this chain (token names differ). */
  claimOp(account: string, acc: ChainAccount): Operation;
  /**
   * Looks a post/comment up by author + permlink.
   * Resolves `null` when the chain answered that it does not exist; REJECTS when the chain could not be asked.
   */
  getContent(author: string, permlink: string): Promise<Post | null>;
  /** The post and its whole comment tree, with the same found/missing/error distinction as `getContent`. */
  getThread(author: string, permlink: string): Promise<ChainThread>;
  /**
   * Earnings statistics of `account` for the last `days` days. Chains with the usual account history can return
   * `collectStats(this, ...)` (see stats.ts); the stats view only ever calls this method.
   */
  /**
   * The account's latest root posts (newest first) as this chain's node can deliver them – used for the pending payouts panel.
   * Each chain picks its own methods (`firstPosts` in posts.ts); the caller filters `is_paidout === false`.
   */
  latestPosts(account: string): Promise<Post[]>;
  /** Latest posts of the accounts `account` follows, one page (continue with the last post as cursor). Each chain lists its own methods. */
  feedPosts(account: string, cur?: Cursor): Promise<Post[]>;
  /** Newest replies under the account's posts (threads rooted in them). */
  recentReplies(account: string): Promise<Post[]>;
  /** An account's own posts (newest first), one page – the profile page. */
  accountPosts(account: string, cur?: Cursor): Promise<Post[]>;
  /** Newest posts that carry `tag`, one page. */
  tagPosts(tag: string, cur?: Cursor, sort?: Sort): Promise<Post[]>;
  stats(account: string, days: number, onProgress?: (p: StatsProgress) => void): Promise<ChainStats>;
  /** Beneficiaries for a new comment/post of `author` under `parent` on this chain. */
  beneficiaries(author: string, parent: Post, tip: boolean): Beneficiary[];
  /** The chain-specific `comment_options` operation (asset symbols and the dollar-percent field name differ). */
  commentOptions(author: string, permlink: string, beneficiaries: Beneficiary[], maxPayout?: string): Operation;
}
