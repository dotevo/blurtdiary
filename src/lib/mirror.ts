/**
 * Multi-chain mirroring. The rules (see docs/MULTICHAIN.md):
 *  1. Blurt is the primary chain – every listing/query goes to Blurt only.
 *  2. A post is published to Blurt and, if the author is also logged in elsewhere, to the other chains too.
 *  3. All copies share ONE permlink, so "is this post on Hive?" is just get_content(<hive account>, permlink).
 *  4. A chain where the post is verifiably missing offers a "send to" button; a chain that could not be reached
 *     (RPC error) is shown as "unknown" and never as "missing".
 *  5./6. A comment/reply goes to every chain where the visitor is logged in AND the parent exists.
 *  7. Copies are merged by permlink; when the text differs between chains the reader can compare versions.
 *     Account names may differ per chain, so the owner's names are kept in the blog configuration.
 */
import { withFooter } from './settings';
import { auth, broadcast, sessionOf } from './auth';
import { adapter, CHAINS, PRIMARY, type ChainAdapter, type ChainThread } from './chains';
import { errorThread, missingThread } from './chains/thread';
import { normAccount } from './config';
import { t } from './i18n';
import { devTip } from './settings';
import { state, USER } from './store';
import { localizeBody, type ImageMap } from './upload';
import { meta, pushKid, tagsOf } from './util';
import type { Operation, Post } from './types';

const THREAD_DEADLINE_MS = 40000; // must exceed (nodes in the queue x per-node timeout), otherwise the last nodes are never tried
const BLURT_COMMUNITY = /^blurt-\d+$/;
export const keyOf = (p: { author: string; permlink: string }): string => `${p.author}/${p.permlink}`;

// ---------- accounts ----------
/** The blog owner's account on `chain` (Blurt = the blog user); undefined when it is not configured. */
export const accountOn = (chain: string): string | undefined => {
  if (chain === PRIMARY) return USER;
  const cfg = normAccount(state.cfg.accounts?.[chain]);
  if (cfg) return cfg;
  // not declared in the settings: the blog owner (logged in on Blurt as the blog user) may still use whatever account they are logged in with there
  return auth.me?.user === USER ? sessionOf(chain)?.user : undefined;
};
/** Other chains the blog owner declared accounts on. */
/** The blog's mirror chains. None while a post of ANOTHER chain is being read (`?chain=steem`): it has no copies to check, show or send to. */
export const mirrorChains = (): ChainAdapter[] => (state.chain && state.chain !== PRIMARY ? [] : CHAINS.filter((c) => c.id !== PRIMARY && threadAccount(c.id)));

// ---------- merged comment tree ----------
/** One comment (or the post's replies) as it exists on one or more chains, matched by permlink. */
export interface MNode { permlink: string; versions: Record<string, Post>; children: MNode[] }

/** Display version: the Blurt copy if there is one, otherwise the first chain that has it. */
export function primaryOf(versions: Record<string, Post>): Post {
  return versions[PRIMARY] ?? versions[CHAINS.find((c) => versions[c.id])?.id ?? ''] ?? Object.values(versions)[0];
}
export const chainsOf = (versions: Record<string, Post>): ChainAdapter[] => CHAINS.filter((c) => versions[c.id]);

// image URLs are ignored when comparing: every chain keeps its own copy of an image, so the URLs legitimately differ
const norm = (s?: string): string => (s ?? '').replace(/\r\n?/g, '\n').replace(/(!\[[^\]]*\]\()[^)\s]+/g, '$1img').trim();
/** True when copies on different chains do not have the same text (somebody edited one of them). */
export function versionsDiffer(versions: Record<string, Post>, withTitle = false): boolean {
  const l = Object.values(versions);
  return l.length > 1 && l.some((v) => norm(v.body) !== norm(l[0].body) || (withTitle && norm(v.title) !== norm(l[0].title)));
}

/** Merges the per-chain threads of ONE post into a single tree. Only chains with status `found` take part. */
export function mergeThreads(threads: Record<string, ChainThread>): { root: Record<string, Post>; nodes: MNode[] } {
  const found = CHAINS.filter((c) => threads[c.id]?.status === 'found' && threads[c.id].root);
  const root: Record<string, Post> = {};
  for (const c of found) root[c.id] = threads[c.id].root!;
  const childrenOf = (parent: Record<string, Post>): MNode[] => {
    const groups = new Map<string, Record<string, Post>>();
    for (const c of found) {
      const p = parent[c.id]; if (!p) continue;
      for (const k of threads[c.id].kids[keyOf(p)] ?? []) {
        let g = groups.get(k.permlink); if (!g) groups.set(k.permlink, (g = {}));
        g[c.id] = k;
      }
    }
    return [...groups.entries()]
      .map(([permlink, versions]) => ({ permlink, versions, children: childrenOf(versions) }))
      .sort((a, b) => primaryOf(a.versions).created.localeCompare(primaryOf(b.versions).created));
  };
  return { root, nodes: childrenOf(root) };
}

// ---------- looking posts up on the other chains ----------
/**
 * A blog that declares no accounts on other chains is still matched with posts of the SAME NAME and permlink there (permlinks carry a hash suffix),
 * but nothing says it is the same person – the page shows a notice, and the copies can be told apart by the "different versions" warning.
 * Used for reading threads only; showing payouts, stats or the "mirror this post" buttons stays with the declared accounts (`accountOn`).
 */
export const looseMatch = (): boolean => !Object.values(state.cfg.accounts ?? {}).some((a) => normAccount(a));
export const threadAccount = (chain: string): string | undefined => accountOn(chain) ?? (chain !== PRIMARY && looseMatch() ? USER : undefined);
export const isUnverified = (chain: string): boolean => chain !== PRIMARY && !accountOn(chain) && !!threadAccount(chain);
export async function loadChainThread(threads: Record<string, ChainThread>, chain: string, permlink: string, account: string | undefined = threadAccount(chain)): Promise<void> {
  if (!account) { threads[chain] = missingThread(chain); return; }
  threads[chain] = { chain, status: 'loading', kids: {} };
  // hard deadline: whatever the nodes do, the badge ends up as found / missing / error, never "checking" forever
  const deadline = new Promise<ChainThread>((res) => setTimeout(() => res(errorThread(chain, new Error('timeout'))), THREAD_DEADLINE_MS));
  threads[chain] = await Promise.race([adapter(chain).getThread(account, permlink), deadline]);
}

// ---------- local (optimistic) posts ----------
function localPost(chain: string, author: string, parent: Post, permlink: string, body: string, bens: Post['beneficiaries']): Post {
  return { author, permlink, parent_author: parent.author, parent_permlink: parent.permlink, title: '', body,
    created: new Date().toISOString().slice(0, 19), active_votes: [], children: 0, payout: 0, depth: (parent.depth ?? 0) + 1,
    beneficiaries: bens, category: parent.category, community_name: chain === PRIMARY ? parent.community_name : undefined };
}

// ---------- comments ----------
/** Chains a comment under `parent` can go to: logged in there AND the parent exists there. */
export const commentTargets = (parent: Record<string, Post>): ChainAdapter[] => CHAINS.filter((c) => auth.sessions[c.id] && parent[c.id]);

export interface SendResult { ok: Record<string, Post>; failed: Record<string, string> }

async function sendOne(chain: string, parent: Post, permlink: string, body: string): Promise<Post> {
  const me = sessionOf(chain); const a = adapter(chain);
  if (!me) throw new Error('not logged in');
  const bens = a.beneficiaries(me.user, parent, devTip.value);
  const ops: Operation[] = [['comment', { parent_author: parent.author, parent_permlink: parent.permlink, author: me.user, permlink, title: '',
    body, json_metadata: JSON.stringify({ app: 'blurtdiary/1.0', format: 'markdown' }) }]];
  if (chain === PRIMARY || bens.length) ops.push(a.commentOptions(me.user, permlink, bens));
  await broadcast(ops, chain);
  return localPost(chain, me.user, parent, permlink, body, bens);
}

/** Sends one text to several chains in parallel, under the same permlink. Never throws; read `ok` / `failed`. */
async function sendTo(targets: ChainAdapter[], parent: Record<string, Post>, permlink: string, body: string): Promise<SendResult> {
  const res: SendResult = { ok: {}, failed: {} };
  await Promise.all(targets.map(async (c) => {
    try { res.ok[c.id] = await sendOne(c.id, parent[c.id], permlink, body); }
    catch (e) { res.failed[c.id] = (e as Error).message || 'error'; }
  }));
  return res;
}

/** New comment / reply under `parent` (its copies on every chain), to every chain we are logged in to. */
export function sendComment(parent: Record<string, Post>, text: string): Promise<SendResult> {
  const permlink = `re-${primaryOf(parent).author.replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;
  return sendTo(commentTargets(parent), parent, permlink, withFooter(text, auth.me?.user));
}

/** My own copy of a comment (the version whose author is my account on that chain). */
const mineOf = (versions: Record<string, Post>): Post | undefined => Object.values(versions).find((v) => CHAINS.some((c) => versions[c.id] === v && auth.sessions[c.id]?.user === v.author));

/** Chains the comment can still be copied to by its author: logged in there, parent exists there, comment does not. */
export function mirrorableChains(node: MNode, parent: Record<string, Post>): ChainAdapter[] {
  if (!mineOf(node.versions)) return [];
  return CHAINS.filter((c) => auth.sessions[c.id] && parent[c.id] && !node.versions[c.id]);
}
export async function mirrorComment(chain: string, node: MNode, parent: Record<string, Post>): Promise<Post> {
  const mine = mineOf(node.versions);
  if (!mine || !parent[chain]) throw new Error('cannot mirror');
  return sendOne(chain, parent[chain], node.permlink, mine.body);
}

// ---------- posts ----------
/** Mirrored copies drop Blurt-only community tags; the first remaining tag is the category. */
function mirrorMeta(post: Post, body: string): { primary: string; json: string } {
  const tags = tagsOf(post).filter((t) => !BLURT_COMMUNITY.test(t));
  const image = body.match(/!\[[^\]]*\]\((https?:[^)\s]+)/)?.[1]; // the thumbnail must point to this chain's copy too
  const m = { ...meta(post), app: 'blurtdiary/1.0', format: 'markdown', tags: tags.length ? tags : ['blurt'], community: undefined, image: image ? [image] : undefined };
  return { primary: m.tags[0], json: JSON.stringify(m) };
}

/** Publishes a copy of a Blurt post on `chain` under the SAME permlink, as the logged-in account of that chain. */
export async function mirrorPost(chain: string, post: Post, images: ImageMap = {}): Promise<void> {
  const me = sessionOf(chain); const a = adapter(chain);
  if (!me) throw new Error('not logged in');
  const want = accountOn(chain);
  if (!want || me.user !== want) throw new Error(`@${me.user} ≠ @${want ?? '?'}`);
  const body = await localizeBody(chain, post.body, images); // each chain gets its own copy of every image
  const { primary, json } = mirrorMeta(post, body);
  const bens = a.beneficiaries(me.user, post, devTip.value);
  const ops: Operation[] = [['comment', { parent_author: '', parent_permlink: primary, author: me.user, permlink: post.permlink, title: post.title, body, json_metadata: json }]];
  if (bens.length) ops.push(a.commentOptions(me.user, post.permlink, bens));
  await broadcast(ops, chain);
}

/** The owner (logged in on Blurt as the blog user) may copy the post to `chain` once it is verifiably missing there. */
export const canMirrorPost = (chain: string, post: Post, threads: Record<string, ChainThread>): boolean =>
  chain !== PRIMARY && post.author === USER && auth.me?.user === USER && threads[chain]?.status === 'missing'
  && !!accountOn(chain) && sessionOf(chain)?.user === accountOn(chain);

/** What publishing will do right now: chains that will get a copy, and logged-in chains that are skipped (and why). */
export function publishPlan(): { targets: { chain: ChainAdapter; account: string }[]; skipped: { chain: ChainAdapter; reason: 'noAccount' | 'mismatch'; has?: string; want?: string }[] } {
  const targets: { chain: ChainAdapter; account: string }[] = []; const skipped: ReturnType<typeof publishPlan>['skipped'] = [];
  for (const c of CHAINS) {
    const s = auth.sessions[c.id]; if (!s || c.id === PRIMARY) continue;
    const want = accountOn(c.id);
    if (!want) skipped.push({ chain: c, reason: 'noAccount', has: s.user });
    else if (want !== s.user) skipped.push({ chain: c, reason: 'mismatch', has: s.user, want });
    else targets.push({ chain: c, account: want });
  }
  return { targets, skipped };
}

/** After the Blurt post is live: copies it to every planned chain. Failures are reported, never thrown (the "send to" button can retry). */
export async function mirrorEverywhere(post: Post, images: ImageMap = {}): Promise<{ ok: string[]; failed: Record<string, string> }> {
  const out = { ok: [] as string[], failed: {} as Record<string, string> };
  await Promise.all(publishPlan().targets.map(async ({ chain }) => {
    try { await mirrorPost(chain.id, post, images); out.ok.push(chain.name); } catch (e) { out.failed[chain.name] = (e as Error).message || 'error'; }
  }));
  return out;
}

// ---------- feedback ----------
/** Adds freshly sent copies to the in-memory threads so they show up at once (the chain data replaces them on reload). */
export function applyResult(threads: Record<string, ChainThread>, parent: Record<string, Post>, res: SendResult): void {
  for (const [c, p] of Object.entries(res.ok)) {
    const th = threads[c];
    if (th?.status === 'found' && parent[c]) pushKid(th.kids, keyOf(parent[c]), p);
  }
}
/** One-line summary of where a comment went. `single` is the message used when only one chain was involved. */
export function describeResult(res: SendResult, single: string): string {
  const ok = Object.keys(res.ok).map((c) => adapter(c).name), failed = Object.entries(res.failed).map(([c, e]) => `${adapter(c).name} (${e})`);
  if (failed.length) return t('sentPartial', { ok: ok.join(', ') || '–', fail: failed.join(', ') });
  return ok.length > 1 ? t('sentTo', { list: ok.join(', ') }) : single;
}
