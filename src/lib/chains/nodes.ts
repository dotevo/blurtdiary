/**
 * Node pools. Every chain owns one (Blurt two: a bridge-capable subset and the full list).
 *
 *  - adaptive pools (Hive, Steem): a node that fails (timeout, network error, HTTP error) goes to the END of the queue and the
 *    node that answered is moved to the FRONT, so later requests talk to it first. The last good node is remembered between visits.
 *  - fixed pools (Blurt): the order never changes, because not every Blurt node serves every API (e.g. bridge.*).
 *  - the visitor can pin a preferred node per chain (footer): it is tried first; the rest stay as fail-over.
 *    The preference only applies to pools that contain that node (rpc.blurt.blog has no bridge API, so bridge calls skip it).
 */
import { reactive } from 'vue';

const PREF = 'bd-rpc-pref-';
const LAST = 'bd-rpc-last-';
const get = (k: string): string => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const put = (k: string, v: string): void => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } };

/** chain id -> preferred node URL ('' = automatic). Shared by all pools of a chain. */
export const prefs = reactive<Record<string, string>>({});
export const getPref = (chain: string): string => (prefs[chain] ??= get(PREF + chain));
export function setPref(chain: string, url: string): void { prefs[chain] = url; put(PREF + chain, url); }

export class NodePool {
  /** Reactive, so the footer can show the active node and which ones failed. */
  readonly state = reactive({ order: [] as string[], active: '', failedAt: {} as Record<string, number> });
  constructor(readonly chain: string, readonly nodes: string[], readonly adaptive: boolean, readonly timeoutMs = 6000) {
    const last = adaptive ? get(LAST + chain) : '';
    this.state.order = last && nodes.includes(last) ? [last, ...nodes.filter((n) => n !== last)] : [...nodes];
  }
  /** Nodes in the order they should be tried: the pinned one first, then the queue. */
  list(): string[] {
    const p = getPref(this.chain);
    return p && this.nodes.includes(p) ? [p, ...this.state.order.filter((n) => n !== p)] : [...this.state.order];
  }
  /** A node answered: remember it (and, in adaptive pools, put it first). */
  ok(url: string): void {
    delete this.state.failedAt[url]; this.state.active = url;
    if (this.adaptive) { this.state.order = [url, ...this.state.order.filter((n) => n !== url)]; put(LAST + this.chain, url); }
  }
  /** A node could not be reached: in adaptive pools it goes to the end of the queue. */
  fail(url: string): void {
    this.state.failedAt[url] = Date.now();
    if (this.adaptive) this.state.order = [...this.state.order.filter((n) => n !== url), url];
  }
}
