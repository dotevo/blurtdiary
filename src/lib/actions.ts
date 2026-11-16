import { auth, broadcast, loginOpen } from './auth';
import { CHAINS, adapter } from './chains';
import { t } from './i18n';
import { voteWeight } from './settings';
import { triggerSupport } from './support';
import { toast } from './toast';
import { isOld, votedBy } from './util';
export { votedBy };
import { loadWallet } from './wallet';
import type { Post } from './types';

/** Chains where the visitor can vote on this item: logged in there AND a copy exists there. */
export const votableChains = (versions: Record<string, Post>) => CHAINS.filter((c) => auth.sessions[c.id] && versions[c.id]);
/** The copies a plain vote can still reach (not past the payout window). */
export const liveChains = (versions: Record<string, Post>) => votableChains(versions).filter((c) => !isOld(versions[c.id]));
/** True when the visitor has voted on every copy a vote can still reach. */
export const votedAll = (versions: Record<string, Post>): boolean => {
  const l = liveChains(versions);
  return l.length > 0 && l.every((c) => votedBy(versions[c.id], auth.sessions[c.id].user));
};

/** Casts / removes the vote on one copy. Resolves with an error text, or '' when it went through. */
async function castVote(chain: string, p: Post, unvote: boolean): Promise<string> {
  const me = auth.sessions[chain].user, weight = voteWeight.value * 100;
  try {
    await broadcast([['vote', { voter: me, author: p.author, permlink: p.permlink, weight: unvote ? 0 : weight }]], chain);
    const rest = (p.active_votes ?? []).filter((v) => v.voter !== me);
    p.active_votes = unvote ? rest : [...rest, { voter: me, percent: weight }];
    void loadWallet(chain); // the vote spent some voting power
    return '';
  } catch (e) { return `${adapter(chain).name} (${(e as Error).message})`; }
}

/**
 * Vote / unvote a post or comment on every chain where we are logged in and a copy exists (same weight everywhere).
 * Unvote applies only if we have voted on all of them; otherwise the missing votes are cast.
 * Copies past their payout window are left alone here: the support button (gift) next to the heart handles them, and
 * when NOTHING can be voted on directly the heart opens the support window itself.
 */
export async function toggleVoteAll(versions: Record<string, Post>): Promise<void> {
  const targets = votableChains(versions);
  if (!targets.length) { if (Object.keys(auth.sessions).length) toast(t('noTargets')); else loginOpen.value = true; return; }
  const live = liveChains(versions);
  if (!live.length) { await triggerSupport(versions); return; }
  const unvote = votedAll(versions);
  const failed: string[] = []; let sent = 0;
  for (const c of live) {
    if (unvote !== votedBy(versions[c.id], auth.sessions[c.id].user)) continue; // unvoting: only chains with a vote; voting: only chains without one
    const err = await castVote(c.id, versions[c.id], unvote);
    if (err) failed.push(err); else sent++;
  }
  if (failed.length) toast(t('voteFailed', { fail: failed.join(', ') }));
  else if (sent) toast(t('voteSent'));
}

/** The same on ONE chain (the hover list of the heart); an old copy opens the support window for that chain. */
export async function toggleVoteOn(versions: Record<string, Post>, chain: string): Promise<void> {
  const p = versions[chain];
  if (!p || !auth.sessions[chain]) { if (!Object.keys(auth.sessions).length) loginOpen.value = true; else toast(t('noTargets')); return; }
  if (isOld(p)) { await triggerSupport(versions, [chain]); return; }
  const err = await castVote(chain, p, votedBy(p, auth.sessions[chain].user));
  toast(err ? t('voteFailed', { fail: err }) : t('voteSent'));
}
