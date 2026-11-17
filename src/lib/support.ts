/**
 * Voting on content past its 7-day payout window – on EVERY chain where the reader is logged in and a copy exists.
 * Per chain:
 *  1. look under the copy for a fresh (< 7 days) support comment whose beneficiaries are exactly `supportBens(copy)` (the copy's own + the rest to its author) –
 *     such a comment pays the same people as the original would, so it does not matter who wrote it (mine is preferred);
 *  2a. found  -> vote on it (nothing to do when I already did)
 *  2b. missing -> post "Supporting original content by @author" with `supportBens(copy)`, wait for the block, vote on it
 *  3. Blurt only, best effort: also vote on the original (separate broadcast, usually refused past the payout window)
 * The plan of every chain (new post / existing post / already done) is shown before anything is sent.
 */
import { reactive } from 'vue';
import { auth, broadcast, loginOpen } from './auth';
import { adapter, CHAINS, PRIMARY } from './chains';
import { sortBens } from './ben';
import { t } from './i18n';
import { setVoteWeight, voteWeight } from './settings';
import { isOld, toDate, votedBy } from './util';
import type { Beneficiary, Post } from './types';

const WEEK = 7 * 24 * 3600 * 1000;
export type SupportState = 'checking' | 'new' | 'existing' | 'done' | 'working' | 'ok' | 'failed';
export interface SupportTarget {
  chain: string; post: Post; bens: Beneficiary[]; state: SupportState;
  /** the support comment to vote on (found, or just posted) */
  existing: { author: string; permlink: string } | null; error: string; step: string;
}
export const support = reactive({ show: false, loading: false, body: '', status: '', isError: false, targets: [] as SupportTarget[] });

/**
 * Beneficiaries of a support comment: whatever the original post pays out to others (e.g. 3% community) stays the same, and EVERYTHING ELSE
 * goes to the original author – the supporter keeps nothing. (The post's own list alone only adds up to 3%; the missing 97% would then
 * be paid to the commenter.)
 */
export function supportBens(post: Post): Beneficiary[] {
  const bens = (post.beneficiaries ?? []).map((b) => ({ account: b.account, weight: b.weight }));
  const rest = 10000 - bens.reduce((s, b) => s + b.weight, 0);
  if (rest > 0) {
    const own = bens.find((b) => b.account === post.author);
    if (own) own.weight += rest; else bens.push({ account: post.author, weight: rest });
  }
  return sortBens(bens);
}
const sameBens = (c: Beneficiary[], want: Beneficiary[]): boolean => {
  if (c.length !== want.length) return false;
  const a = sortBens(c);
  return a.every((x, i) => x.account === want[i].account && x.weight === want[i].weight);
};

/** Chains where this item is too old to vote on and the reader can support it (logged in + a copy exists). */
export const oldChains = (versions: Record<string, Post>) => CHAINS.filter((c) => auth.sessions[c.id] && versions[c.id] && isOld(versions[c.id]));

/** What supporting `post` on `chain` would do right now (one scan of the replies). Never throws: a failed scan is treated as "no support comment yet". */
/** The copy with its real beneficiary list (a list read from a replies call may be missing it). */
const withBens = async (chain: string, post: Post): Promise<Post> => {
  if (post.beneficiaries) return post;
  try { return (await adapter(chain).getContent(post.author, post.permlink)) ?? post; } catch { return post; } // the copy's real beneficiaries decide who gets the money
};
/** Beneficiaries a support comment under `original` must have on `chain` (also used when a support comment is copied to another chain). */
export const supportBensFor = async (chain: string, original: Post): Promise<Beneficiary[]> => supportBens(await withBens(chain, original));

/** Did `me` vote on this comment? Some nodes (Melek, Steem) return comments from get_content_replies with an EMPTY vote list, so then the votes are asked for separately. */
async function votedOn(chain: string, c: Post, me: string): Promise<boolean> {
  if (c.active_votes?.length) return votedBy(c, me);
  try {
    const votes = await adapter(chain).call<NonNullable<Post['active_votes']>>('condenser_api', 'get_active_votes', [c.author, c.permlink]);
    return votedBy({ ...c, active_votes: votes }, me);
  } catch { return votedBy(c, me); }
}

/** What supporting `post` on `chain` would do right now (one scan of the replies). Never throws: a failed scan is treated as "no support comment yet". */
export async function planChain(chain: string, post: Post): Promise<SupportTarget> {
  const me = auth.sessions[chain]?.user ?? ''; const a = adapter(chain);
  const full = await withBens(chain, post);
  const bens = supportBens(full);
  const tg: SupportTarget = { chain, post: full, bens, state: 'new', existing: null, error: '', step: '' };
  try {
    const kids = await a.call<Post[]>('condenser_api', 'get_content_replies', [post.author, post.permlink]);
    const fresh = kids.filter((c) => Date.now() - toDate(c.created).getTime() < WEEK && sameBens(c.beneficiaries ?? [], bens));
    const ex = fresh.find((c) => c.author === me) ?? fresh[0];
    if (ex) { tg.existing = { author: ex.author, permlink: ex.permlink }; tg.state = (await votedOn(chain, ex, me)) ? 'done' : 'existing'; }
  } catch (e) { console.warn('Support scan failed on', chain, e); }
  return tg;
}

/** Plans kept for the hover list (a scan is one request per chain; reused for a minute). */
export const plans = reactive<Record<string, { at: number; target: SupportTarget }>>({});
const planKey = (chain: string, p: Post): string => `${chain}/${p.author}/${p.permlink}`;
export async function peekPlan(chain: string, post: Post): Promise<void> {
  const k = planKey(chain, post), cur = plans[k];
  if (cur && Date.now() - cur.at < 60000) return;
  plans[k] = { at: Date.now(), target: { chain, post, bens: [], state: 'checking', existing: null, error: '', step: '' } };
  plans[k] = { at: Date.now(), target: await planChain(chain, post) };
}
export const planOf = (chain: string, post: Post): SupportTarget | undefined => plans[planKey(chain, post)]?.target;

/** Opens the support window for the old copies in `versions` (all of them, or only `only`). */
export async function triggerSupport(versions: Record<string, Post>, only?: string[]): Promise<void> {
  if (!Object.keys(auth.sessions).length) { loginOpen.value = true; return; }
  const chains = oldChains(versions).filter((c) => !only || only.includes(c.id));
  if (!chains.length) return;
  Object.assign(support, {
    show: true, loading: false, body: '', status: '', isError: false,
    targets: chains.map((c) => ({ chain: c.id, post: versions[c.id], bens: [], state: 'checking', existing: null, error: '', step: '' } as SupportTarget)),
  });
  const planned = await Promise.all(chains.map((c) => planChain(c.id, versions[c.id])));
  support.targets = planned;
}

/** Sends everything the plan says, on all chains in parallel. A chain that fails keeps its place (retry continues where it stopped). */
export async function submitSupport(): Promise<void> {
  const todo = support.targets.filter((x) => x.state === 'new' || x.state === 'existing' || x.state === 'failed');
  if (!todo.length || support.loading) return;
  const weight = Math.min(Math.max(Math.round(voteWeight.value), 1), 100) * 100;
  setVoteWeight(voteWeight.value);
  support.loading = true; support.isError = false; support.status = '';
  await Promise.all(todo.map(async (x) => {
    const a = adapter(x.chain); const me = auth.sessions[x.chain]?.user;
    x.error = ''; x.state = 'working';
    try {
      if (!me) throw new Error(t('needLogin'));
      if (!x.existing) {
        x.step = t('supporting');
        const permlink = `support-${x.post.author.replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;
        await broadcast([
          ['comment', { parent_author: x.post.author, parent_permlink: x.post.permlink, author: me, permlink, title: '',
            body: `Supporting original content by @${x.post.author}\n\n${support.body}`.trim(), json_metadata: JSON.stringify({ app: 'blurtdiary/1.0', format: 'markdown' }) }],
          a.commentOptions(me, permlink, sortBens(x.bens)), // complete list: sums to 100%, the original author gets the remainder
        ], x.chain);
        x.existing = { author: me, permlink };
        x.step = t('waitingBlock');
        await new Promise((r) => setTimeout(r, 5000));
      }
      x.step = t('votingSupport');
      await broadcast([['vote', { voter: me, author: x.existing.author, permlink: x.existing.permlink, weight }]], x.chain);
      x.state = 'ok'; x.step = '';
      delete plans[planKey(x.chain, x.post)];
      if (x.chain === PRIMARY) void broadcast([['vote', { voter: me, author: x.post.author, permlink: x.post.permlink, weight }]], x.chain).catch((e) => console.warn('Support: vote on the original failed (past its payout window)', e));
    } catch (e) { x.state = 'failed'; x.error = (e as Error).message || 'error'; x.step = ''; }
  }));
  support.loading = false;
  if (support.targets.some((x) => x.state === 'failed')) { support.isError = true; support.status = t('supportFailed'); return; }
  support.status = t('supportDone');
  setTimeout(() => { if (!support.loading) support.show = false; }, 1500);
}
