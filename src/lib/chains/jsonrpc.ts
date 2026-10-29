/**
 * Shared JSON-RPC transport with node fail-over. It knows nothing about any particular blockchain –
 * every chain adapter hands it its own node list.
 */
/** A node that does not answer within this time is skipped (otherwise a dead node would hang the caller for minutes). */
export const NODE_TIMEOUT_MS = 7000;

export class RpcError extends Error {
  constructor(message: string, readonly nodes: string[]) { super(message); this.name = 'RpcError'; }
}

/** Calls `method` on the first node of `pool` that answers; throws when every node fails. */
export async function jsonRpc<T = unknown>(pool: string[], api: string, method: string, params: unknown): Promise<T> {
  let lastErr: unknown = new RpcError('RPC failed', pool);
  for (const url of pool) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), NODE_TIMEOUT_MS);
    try {
      // trailing slash: some nodes (rpc.beblurt.com) answer a POST to the bare host with a 308 redirect
      const r = await fetch(url.replace(/\/?$/, '/'), {
        // NO Content-Type header on purpose: it would trigger a CORS preflight, which some nodes answer with a
        // redirect -> blocked. The body is still parsed as JSON by the node.
        method: 'POST', mode: 'cors', cache: 'no-cache', signal: ctl.signal,
        // bridge.* must be called directly with an object as params; condenser-style APIs use the "call" wrapper.
        body: JSON.stringify(api === 'bridge'
          ? { jsonrpc: '2.0', id: 1, method: `bridge.${method}`, params }
          : { jsonrpc: '2.0', id: 1, method: 'call', params: [api, method, params] }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'RPC error');
      return j.result as T;
    } catch (e) { lastErr = ctl.signal.aborted ? new RpcError(`timeout: ${url}`, pool) : e; console.warn('RPC node failed:', url, method, e); }
    finally { clearTimeout(timer); }
  }
  throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr), pool);
}
