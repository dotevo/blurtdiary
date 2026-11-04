/**
 * Shared JSON-RPC transport with node fail-over (the queue itself lives in nodes.ts). It knows nothing about any particular blockchain -
 * every chain adapter hands it its own node list.
 *
 * Two request styles, because the node families differ:
 *  - 'legacy' (Blurt): body without a Content-Type header (so the browser sends a "simple" request and skips the CORS preflight,
 *    which some Blurt nodes answer with a redirect), `bridge.*` called directly, everything else through the `call` wrapper.
 *  - 'modern' (Hive, Steem): the standard form every public node and PeakD/Steemit use - `Content-Type: application/json` and
 *    direct method names (`condenser_api.get_content`, `bridge.get_discussion`). If a node refuses it, the same node is tried
 *    once more with the `call` wrapper before moving on to the next node.
 */
import type { NodePool } from './nodes';


export class RpcError extends Error {
  /** true = the node answered with a JSON-RPC error (it is alive, only this call failed); false = it could not be reached. */
  constructor(message: string, readonly nodes: string[], readonly answered = false) { super(message); this.name = 'RpcError'; }
}
export type RpcStyle = 'legacy' | 'modern';

const bodyFor = (api: string, method: string, params: unknown, direct: boolean): string =>
  JSON.stringify(api === 'bridge' || direct
    ? { jsonrpc: '2.0', id: 1, method: `${api}.${method}`, params }
    : { jsonrpc: '2.0', id: 1, method: 'call', params: [api, method, params] });

async function once<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // trailing slash: some nodes (rpc.beblurt.com) answer a POST to the bare host with a 308 redirect
    const r = await fetch(url.replace(/\/?$/, '/'), { ...init, mode: 'cors', cache: 'no-cache', signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new RpcError(j.error.message || 'RPC error', [url], true);
    return j.result as T;
  } catch (e) {
    throw ctl.signal.aborted ? new Error(`timeout: ${url}`) : e;
  } finally { clearTimeout(timer); }
}

/**
 * Calls `method` on the nodes of `pool` in queue order and returns the first answer.
 * Unreachable nodes are reported to the pool (adaptive pools move them to the end); a node that answers is moved to the front.
 * Throws the last reason when every node fails.
 */
export async function jsonRpc<T = unknown>(pool: NodePool, api: string, method: string, params: unknown, style: RpcStyle = 'legacy'): Promise<T> {
  let lastErr: unknown = new RpcError('RPC failed', pool.nodes);
  for (const url of pool.list()) {
    const attempts: RequestInit[] = style === 'modern'
      ? [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(api, method, params, true) },
         { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(api, method, params, false) }]
      : [{ method: 'POST', body: bodyFor(api, method, params, false) }];
    let reachable = true;
    for (const init of attempts) {
      try { const r = await once<T>(url, init, pool.timeoutMs); pool.ok(url); return r; }
      catch (e) {
        lastErr = e; console.warn('RPC node failed:', url, `${api}.${method}`, e);
        if (e instanceof RpcError && e.answered) { reachable = true; continue; }
        reachable = false;
        if ((e as Error).message?.startsWith('timeout')) break; // no point asking a silent node twice
      }
    }
    if (!reachable) pool.fail(url);
  }
  throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr), pool.nodes);
}
