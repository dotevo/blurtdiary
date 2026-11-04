/**
 * Shared JSON-RPC transport with node fail-over. It knows nothing about any particular blockchain -
 * every chain adapter hands it its own node list.
 *
 * Two request styles, because the node families differ:
 *  - 'legacy' (Blurt): body without a Content-Type header (so the browser sends a "simple" request and skips the CORS preflight,
 *    which some Blurt nodes answer with a redirect), `bridge.*` called directly, everything else through the `call` wrapper.
 *  - 'modern' (Hive, Steem): the standard form every public node and PeakD/Steemit use - `Content-Type: application/json` and
 *    direct method names (`condenser_api.get_content`, `bridge.get_discussion`). If a node refuses it, the same node is tried
 *    once more with the `call` wrapper before moving on to the next node.
 */
/** A node that does not answer within this time is skipped (otherwise a dead node would hang the caller for minutes). */
export const NODE_TIMEOUT_MS = 7000;

export class RpcError extends Error {
  constructor(message: string, readonly nodes: string[]) { super(message); this.name = 'RpcError'; }
}
export type RpcStyle = 'legacy' | 'modern';

const bodyFor = (api: string, method: string, params: unknown, direct: boolean): string =>
  JSON.stringify(api === 'bridge' || direct
    ? { jsonrpc: '2.0', id: 1, method: `${api}.${method}`, params }
    : { jsonrpc: '2.0', id: 1, method: 'call', params: [api, method, params] });

async function once<T>(url: string, init: RequestInit, timeoutUrl: string): Promise<T> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), NODE_TIMEOUT_MS);
  try {
    // trailing slash: some nodes (rpc.beblurt.com) answer a POST to the bare host with a 308 redirect
    const r = await fetch(url.replace(/\/?$/, '/'), { ...init, mode: 'cors', cache: 'no-cache', signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'RPC error');
    return j.result as T;
  } catch (e) {
    throw ctl.signal.aborted ? new Error(`timeout: ${timeoutUrl}`) : e;
  } finally { clearTimeout(timer); }
}

/** Calls `method` on the first node of `pool` that answers; throws (with the last node's reason) when every node fails. */
export async function jsonRpc<T = unknown>(pool: string[], api: string, method: string, params: unknown, style: RpcStyle = 'legacy'): Promise<T> {
  let lastErr: unknown = new RpcError('RPC failed', pool);
  for (const url of pool) {
    const attempts: RequestInit[] = style === 'modern'
      ? [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(api, method, params, true) },
         { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(api, method, params, false) }]
      : [{ method: 'POST', body: bodyFor(api, method, params, false) }];
    for (const init of attempts) {
      try { return await once<T>(url, init, url); }
      catch (e) { lastErr = e; console.warn('RPC node failed:', url, `${api}.${method}`, e); if ((e as Error).message?.startsWith('timeout')) break; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr), pool);
}
