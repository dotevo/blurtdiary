/**
 * Voting on content past its 7-day payout window – ported from BlurtForum's useSupport.ts.
 *  1. look for a fresh (< 7 days) support comment by the voter under the post, with the SAME beneficiaries as the post
 *  2a. found  -> vote on it
 *  2b. missing -> post "Supporting original content by @author" with the original post's beneficiaries, then vote on it
 *  3. best-effort (separate broadcast) vote on the original post as well
 */
import { reactive } from 'vue';
import { auth, broadcast, loginOpen } from './auth';
import { commentOptions, sortBens } from './ben';
import { t } from './i18n';
import { rpc } from './rpc';
import { setVoteWeight, voteWeight } from './settings';
import { toDate } from './util';
import type { Beneficiary, Post } from './types';

const WEEK = 7 * 24 * 3600 * 1000;
export const support = reactive({
  show: false, loading: false, author: '', permlink: '', beneficiaries: [] as Beneficiary[], body: '', status: '', isError: false,
  existingAuthor: null as string | null, existingPermlink: null as string | null,
});

function sameBens(c: Beneficiary[], p: Beneficiary[], author: string): boolean {
  if (!p.length) return c.length === 1 && c[0].account === author && c[0].weight === 10000;
  if (c.length !== p.length) return false;
  const a = sortBens(c), b = sortBens(p);
  return a.every((x, i) => x.account === b[i].account && x.weight === b[i].weight);
}

export async function triggerSupport(post: Post): Promise<void> {
  const me = auth.me?.user;
  if (!me) { loginOpen.value = true; return; }
  let children: Post[] = [];
  try { children = await rpc<Post[]>('condenser_api', 'get_content_replies', [post.author, post.permlink]); } catch (e) { console.warn('Support scan failed', e); }
  const pBens = post.beneficiaries ?? [];
  const existing = children.find((c) => c.author === me && Date.now() - toDate(c.created).getTime() < WEEK && sameBens(c.beneficiaries ?? [], pBens, post.author));
  Object.assign(support, {
    show: true, loading: false, author: post.author, permlink: post.permlink, beneficiaries: pBens, body: '', status: '', isError: false,
    existingAuthor: existing?.author ?? null, existingPermlink: existing?.permlink ?? null,
  });
}

export async function submitSupport(): Promise<void> {
  const me = auth.me?.user; if (!me || !support.author) return;
  const weight = Math.min(Math.max(Math.round(voteWeight.value), 1), 100) * 100;
  setVoteWeight(voteWeight.value);
  const voteOriginal = async (): Promise<void> => { // separate broadcast: if the chain rejects it, the support vote must not fail with it
    try { await broadcast([['vote', { voter: me, author: support.author, permlink: support.permlink, weight }]]); }
    catch (e) { console.warn('Support: vote on the original post failed (probably past its payout window)', e); }
  };
  support.loading = true; support.isError = false;
  try {
    if (support.existingAuthor && support.existingPermlink) {
      support.status = t('votingSupport');
      await broadcast([['vote', { voter: me, author: support.existingAuthor, permlink: support.existingPermlink, weight }]]);
    } else {
      support.status = t('supporting');
      const permlink = `support-${support.author.replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;
      const bens = support.beneficiaries.length ? sortBens(support.beneficiaries) : [{ account: support.author, weight: 10000 }];
      await broadcast([
        ['comment', { parent_author: support.author, parent_permlink: support.permlink, author: me, permlink, title: '',
          body: `Supporting original content by @${support.author}\n\n${support.body}`.trim(),
          json_metadata: JSON.stringify({ app: 'blurtdiary/1.0', format: 'markdown' }) }],
        commentOptions(me, permlink, bens),
      ]);
      support.status = t('waitingBlock');
      await new Promise((r) => setTimeout(r, 5000));
      support.status = t('votingSupport');
      await broadcast([['vote', { voter: me, author: me, permlink, weight }]]);
    }
    void voteOriginal();
    support.status = t('supportDone');
    setTimeout(() => { support.show = false; }, 1500);
  } catch (e) { support.isError = true; support.status = (e as Error).message; }
  support.loading = false;
}
