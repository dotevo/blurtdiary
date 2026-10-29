// Blurt is the primary chain, so the app-wide `rpc` helper always talks to Blurt.
// Other chains are reached through their adapters in ./chains (one file per chain).
import { ALL_NODES, BRIDGE_NODES, blurt } from './chains/blurt';

export { ALL_NODES, BRIDGE_NODES };
export const rpc = <T = unknown>(api: string, method: string, params: unknown): Promise<T> => blurt.call<T>(api, method, params);
