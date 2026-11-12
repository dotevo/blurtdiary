/**
 * Transactions for the Steem-family chains (Hive, Steem, Melek). The signing library (dblurt) knows only Blurt's binary format, and Blurt numbers its
 * operations differently (comment_options 13, custom_json 12, claim_reward_balance 31 – on these chains 19, 18 and 39) and has different claim fields,
 * so through it a claim fails and a follow / comment_options would be sent as another operation. Here the few operations the app uses are serialized
 * with the numbering of the Steem family, signed with the same key code, and sent with `broadcast_transaction`.
 *
 * Safety net: before signing, the node is asked to serialize the very same transaction (`get_transaction_hex`) and the bytes must be identical.
 * A mismatch (e.g. a chain with another numbering) aborts with a message instead of signing something else. A chain listed in `STRICT` is never signed
 * without that check.
 */
import * as dblurt from '@beblurt/dblurt';
import type { Operation } from '../types';
import type { ChainAdapter } from './types';

const OP_ID: Record<string, number> = { vote: 0, comment: 1, custom_json: 18, comment_options: 19, claim_reward_balance: 39 };
/** Chains whose numbering is not known for sure: they are only signed when the node confirms the serialization. */
const STRICT = new Set(['melek']);
const EXPIRE_MS = 60_000;

class Out {
  b: number[] = [];
  u8(n: number): void { this.b.push(n & 255); }
  u16(n: number): void { this.u8(n); this.u8(n >> 8); }
  u32(n: number): void { this.u16(n & 0xffff); this.u16(Math.floor(n / 65536) & 0xffff); }
  varint(n: number): void { let v = n; while (v >= 0x80) { this.b.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } this.b.push(v); }
  str(s: string): void { const e = new TextEncoder().encode(s); this.varint(e.length); for (const x of e) this.b.push(x); }
  bool(v: unknown): void { this.u8(v ? 1 : 0); }
  strs(l: unknown): void { const a = (l as string[]) ?? []; this.varint(a.length); for (const s of a) this.str(s); }
  /** "110.409 MELEK" -> int64 amount, precision, symbol padded to 7 bytes */
  asset(v: unknown): void {
    const m = /^(-?)(\d+)(?:\.(\d+))? ([A-Z]{1,7})$/.exec(String(v));
    if (!m) throw new Error(`Invalid asset '${String(v)}'`);
    let n = BigInt(m[2] + (m[3] ?? '')); if (m[1]) n = -n;
    n = BigInt.asUintN(64, n);
    for (let i = 0; i < 8; i++) this.u8(Number((n >> BigInt(8 * i)) & 255n));
    this.u8((m[3] ?? '').length);
    for (let i = 0; i < 7; i++) this.u8(m[4].charCodeAt(i) || 0);
  }
  bytes(): Uint8Array { return Uint8Array.from(this.b); }
}

type Data = Record<string, unknown>;
function writeOp(o: Out, [name, d]: Operation): void {
  const x = d as Data;
  if (!(name in OP_ID)) throw new Error(`operation ${name} is not supported on this chain`);
  o.varint(OP_ID[name]);
  switch (name) {
    case 'vote': o.str(x.voter as string); o.str(x.author as string); o.str(x.permlink as string); o.u16(Number(x.weight) & 0xffff); break;
    case 'comment': for (const k of ['parent_author', 'parent_permlink', 'author', 'permlink', 'title', 'body', 'json_metadata']) o.str(String(x[k] ?? '')); break;
    case 'custom_json': o.strs(x.required_auths); o.strs(x.required_posting_auths); o.str(x.id as string); o.str(x.json as string); break;
    case 'comment_options': {
      o.str(x.author as string); o.str(x.permlink as string); o.asset(x.max_accepted_payout);
      o.u16(Number(x.percent_hbd ?? x.percent_steem_dollars ?? 10000)); o.bool(x.allow_votes); o.bool(x.allow_curation_rewards);
      const ext = (x.extensions as [number, { beneficiaries: { account: string; weight: number }[] }][]) ?? [];
      o.varint(ext.length);
      for (const [idx, v] of ext) { o.varint(idx); o.varint(v.beneficiaries.length); for (const b of v.beneficiaries) { o.str(b.account); o.u16(b.weight); } }
      break;
    }
    case 'claim_reward_balance': {
      o.str(x.account as string);
      o.asset(x.reward_hive ?? x.reward_steem); o.asset(x.reward_hbd ?? x.reward_sbd); o.asset(x.reward_vests);
      break;
    }
  }
}

const hex = (b: Uint8Array): string => [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

interface Tx { ref_block_num: number; ref_block_prefix: number; expiration: string; operations: Operation[]; extensions: unknown[]; signatures?: string[] }
function serialize(tx: Tx): Uint8Array {
  const o = new Out();
  o.u16(tx.ref_block_num); o.u32(tx.ref_block_prefix); o.u32(Math.floor(new Date(tx.expiration + 'Z').getTime() / 1000));
  o.varint(tx.operations.length); for (const op of tx.operations) writeOp(o, op);
  o.varint(0); // extensions
  return o.bytes();
}

/** Builds, checks against the node, signs and broadcasts `ops` on a Steem-family chain with a posting key (WIF). */
export async function broadcastSteemFamily(a: ChainAdapter, ops: Operation[], wif: string): Promise<void> {
  const props = await a.call<{ head_block_number: number; head_block_id: string; time: string }>('condenser_api', 'get_dynamic_global_properties', []);
  const tx: Tx = {
    ref_block_num: props.head_block_number & 0xffff,
    ref_block_prefix: new DataView(unhex(props.head_block_id).buffer).getUint32(4, true),
    expiration: new Date(new Date(props.time + 'Z').getTime() + EXPIRE_MS).toISOString().slice(0, -5),
    operations: ops, extensions: [],
  };
  const mine = hex(serialize(tx));
  let theirs = '';
  try { theirs = String(await a.call('condenser_api', 'get_transaction_hex', [{ ...tx, signatures: [] }])); } catch (e) { console.warn('get_transaction_hex', a.id, e); }
  if (theirs) {
    if (theirs !== mine && theirs !== mine + '00') throw new Error(`${a.name}: the node serializes this operation differently (ours ${mine.slice(0, 300)} / node ${theirs.slice(0, 300)}) – not signed`);
  } else if (STRICT.has(a.id)) throw new Error(`${a.name}: could not verify the transaction with the node – not signed`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from([...unhex(a.chainId ?? ''), ...unhex(mine)])));
  const sig = dblurt.PrivateKey.from(wif).sign(digest as never).toString();
  await a.call('condenser_api', 'broadcast_transaction', [{ ...tx, signatures: [sig] }]);
}
