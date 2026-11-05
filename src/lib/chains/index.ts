/**
 * Registry of supported chains. To add one (e.g. another Steem fork): copy hive.ts to <chain>.ts, adjust the nodes,
 * asset symbols, chain id and key prefix, add its id to ChainId in types.ts and list it below.
 * Blurt must stay first: it is the primary chain.
 */
import { blurt } from './blurt';
import { hive } from './hive';
import { melek } from './melek';
import { steem } from './steem';
import type { ChainAdapter, ChainId } from './types';

export const CHAINS: ChainAdapter[] = [blurt, hive, steem, melek];
export const CHAIN_IDS: ChainId[] = CHAINS.map((c) => c.id);
export const PRIMARY: ChainId = 'blurt';
export const chainOf = (id: string): ChainAdapter | undefined => CHAINS.find((c) => c.id === id);
/** Like chainOf but never undefined (falls back to Blurt, so UI code does not need null checks). */
export const adapter = (id: string): ChainAdapter => chainOf(id) ?? blurt;
export type { ChainAdapter, ChainId, ChainThread, MirrorStatus } from './types';
