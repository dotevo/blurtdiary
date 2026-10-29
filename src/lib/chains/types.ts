import type { Beneficiary, Operation, Post } from '../types';

/** Identifier of a supported blockchain: 'blurt' (primary), 'hive', 'steem'. The registry in index.ts is the source of truth. */
export type ChainId = string;

/** Account record as returned by `condenser_api.get_accounts` (field names differ a little per chain). */
export type ChainAccount = { posting: { key_auths: [string, number][] } } & Record<string, unknown>;
/** Pending (unclaimed) rewards of an account. */
export interface RewardInfo { has: boolean; label: string; power: string }

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
  /** Key prefix of public keys on this chain (BLT / STM). */
  addressPrefix: string;
  /** Hex chain id used when signing transactions; undefined = the dblurt default (Blurt). */
  chainId?: string;
  /** Node list used for broadcasting and for plain (condenser_api) calls. */
  nodes: string[];
  /** Account that receives the optional app-author tip on this chain (none = no tip is requested). */
  devAccount?: string;
  /** Prefix WhaleVault expects in `username` for this chain. */
  vaultPrefix: string;
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
  /** Beneficiaries for a new comment/post of `author` under `parent` on this chain. */
  beneficiaries(author: string, parent: Post, tip: boolean): Beneficiary[];
  /** The chain-specific `comment_options` operation (asset symbols and the dollar-percent field name differ). */
  commentOptions(author: string, permlink: string, beneficiaries: Beneficiary[], maxPayout?: string): Operation;
}
