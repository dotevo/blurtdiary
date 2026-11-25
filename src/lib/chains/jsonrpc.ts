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
import { deadKey, isDead, isPermanent, markDead } from './dead';
import type { NodePool } from './nodes';


/** Text of a JSON-RPC `error`: nodes answer with a string, but also with nested objects (`message: {…}`, details in `data`) that would otherwise print as "[object Object]". */
export function rpcErrorText(err: unknown): string {
  if (typeof err === 'string') return err;
  const e = err as { message?: unknown; data?: { message?: unknown; stack?: { format?: unknown }[] } } | null;
  const m = e?.message;
  let out = typeof m === 'string' ? m : '';
  const d = e?.data;
  if (!out || out.length < 40) { const extra = [d?.message, ...(d?.stack ?? []).map((x) => x?.format)].filter((x): x is string => typeof x === 'string' && x !== out)[0]; if (extra) out = out ? `${out}: ${extra}` : extra; }
  if (!out) { try { out = JSON.stringify(err); } catch { out = 'RPC error'; } }
  return out.slice(0, 400);
}
export class RpcError extends Error {
  /** true = the node answered with a JSON-RPC error (it is alive, only this call failed); false = it could not be reached. */
  constructor(message: string, readonly nodes: string[], readonly answered = false) { super(message); this.name = 'RpcError'; }
}
/** Hive/Steem nodes answer get_content for an unpublished post with this assert instead of an empty post. */
export const isMissingError = (e: unknown): boolean => e instanceof RpcError && e.answered && /does not exist|not found/i.test(e.message);
export type RpcStyle = 'legacy' | 'modern';

const bodyFor = (api: string, method: string, params: unknown, direct: boolean): string =>
  JSON.stringify(api === 'bridge' || direct
    ? { jsonrpc: '2.0', id: 1, method: api ? `${api}.${method}` : method, params } // empty api = a bare method name (Melek's get_notifications)
    : { jsonrpc: '2.0', id: 1, method: 'call', params: [api, method, params] });

async function once<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // trailing slash: some nodes (rpc.beblurt.com) answer a POST to the bare host with a 308 redirect
    const r = await fetch(url.replace(/\/?$/, '/'), { ...init, mode: 'cors', cache: 'no-cache', signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new RpcError(rpcErrorText(j.error) || 'RPC error', [url], true);
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
  const dk = deadKey(pool.chain, api, method);
  if (isDead(dk)) throw new RpcError(`${api}.${method} is not available on ${pool.chain} (skipped)`, pool.nodes, true);
  let lastErr: unknown = new RpcError('RPC failed', pool.nodes);
  let asked = 0, refused = 0;
  for (const url of pool.list()) {
    asked++;
    const attempts: RequestInit[] = style === 'modern'
      ? [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(api, method, params, true) },
         ...(api ? [{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(api, method, params, false) }] : [])]
      : [{ method: 'POST', body: bodyFor(api, method, params, false) }];
    let reachable = true, ref = false;
    for (const init of attempts) {
      try { const r = await once<T>(url, init, pool.timeoutMs); pool.ok(url); return r; }
      catch (e) {
        lastErr = e;
        if (isMissingError(e)) { pool.ok(url); throw e; } // a healthy node says the post is not there: final, no need to ask the others
        console.warn('RPC node failed:', url, `${api}.${method}`, e);
        if (e instanceof RpcError && e.answered) { reachable = true; if (isPermanent(e.message)) ref = true; continue; }
        reachable = false;
        if ((e as Error).message?.startsWith('timeout')) break; // no point asking a silent node twice
      }
    }
    if (!reachable) pool.fail(url);
    if (ref) refused++;
  }
  if (asked && refused >= asked) markDead(dk); // every node said it does not have this API
  throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr), pool.nodes);
}
