import { auth, broadcast, loginOpen } from './auth';
import { CHAINS, PRIMARY, adapter } from './chains';
import { t } from './i18n';
import { voteWeight } from './settings';
import { triggerSupport } from './support';
import { toast } from './toast';
import { isOld, num } from './util';
import { loadWallet } from './wallet';
import type { Post } from './types';

/** Did `user` vote on this copy? (condenser gives `percent`, bridge gives `rshares`; an unvote leaves 0 in both.) */
export const votedBy = (p: Post, user: string): boolean =>
  !!p.active_votes?.some((v) => v.voter === user && (num(v.percent) > 0 || num((v as { rshares?: unknown }).rshares) > 0));

/** Chains where the visitor can vote on this item: logged in there AND a copy exists there. */
export const votableChains = (versions: Record<string, Post>) => CHAINS.filter((c) => auth.sessions[c.id] && versions[c.id]);
/** True when the visitor has voted on every copy they are able to vote on. */
export const votedAll = (versions: Record<string, Post>): boolean => {
  const l = votableChains(versions);
  return l.length > 0 && l.every((c) => votedBy(versions[c.id], auth.sessions[c.id].user));
};

/**
 * Vote / unvote a post or comment on every chain where we are logged in and a copy exists (same weight everywhere).
 * Unvote applies only if we have voted on all of them; otherwise the missing votes are cast.
 * Blurt content past its payout window goes through the support-comment flow; on other chains it is simply skipped.
 */
export async function toggleVoteAll(versions: Record<string, Post>): Promise<void> {
  const targets = votableChains(versions);
  if (!targets.length) { if (Object.keys(auth.sessions).length) toast(t('noTargets')); else loginOpen.value = true; return; }
  const unvote = votedAll(versions);
  const weight = voteWeight.value * 100;
  const failed: string[] = [];
  let sent = 0;
  for (const c of targets) { // Blurt is first in CHAINS
    const p = versions[c.id], me = auth.sessions[c.id].user, was = votedBy(p, me);
    if (unvote !== was) continue; // unvoting: only chains with a vote; voting: only chains without one
    if (isOld(p)) {
      if (was) { toast(t('alreadyVoted')); continue; }
      if (c.id === PRIMARY) { await triggerSupport(p); continue; }
      failed.push(`${c.name} (${t('oldOtherChain')})`); continue;
    }
    try {
      await broadcast([['vote', { voter: me, author: p.author, permlink: p.permlink, weight: unvote ? 0 : weight }]], c.id);
      const rest = (p.active_votes ?? []).filter((v) => v.voter !== me);
      p.active_votes = unvote ? rest : [...rest, { voter: me, percent: weight }];
      sent++; void loadWallet(c.id); // the vote spent some voting power
    } catch (e) { failed.push(`${adapter(c.id).name} (${(e as Error).message})`); }
  }
  if (failed.length) toast(t('voteFailed', { fail: failed.join(', ') }));
  else if (sent) toast(t('voteSent'));
}
