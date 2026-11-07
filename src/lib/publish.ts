import { auth, broadcast } from './auth';
import { isHttpUrl, rememberImported } from './rss';
import { beneficiariesFor, commentOptions } from './ben';
import { CONFIG_PERMLINK, parseTags, serializeConfig } from './config';
import { t } from './i18n';
import { mirrorEverywhere } from './mirror';
import type { ImageMap } from './upload';
import { state, USER } from './store';
import { withFooter } from './settings';
import { slug } from './util';
import type { Operation, Post } from './types';

export const COMMUNITY_RE = /^blurt-\d+$/;
export const MAX_TAGS = 5;

/** Tags exactly like BlurtForum: the community (if any) or the first tag is the category (parent_permlink); at most 5 in total. */
export function buildTags(tagsText: string, community: string): { primary: string; tags: string[] } {
  const list = parseTags(tagsText);
  const primary = community || list[0] || 'blurt';
  const tags = [primary];
  for (const x of list) { if (tags.length >= MAX_TAGS) break; if (!tags.includes(x)) tags.push(x); }
  return { primary, tags };
}

export interface NewPost { title: string; body: string; tagsText: string; community: string; images?: ImageMap; /** link of the article this post was imported from (RSS import) */ source?: string }

export interface PublishResult { permlink: string; mirrored: string[]; failed: Record<string, string> }

/**
 * Publishes a post on the logged-in user's blog (Blurt, the primary chain; beneficiaries: community 3% (if any) + dev tip 1%
 * (if enabled)) and then copies it – same permlink – to every other chain the author is logged in to.
 * A failing mirror never fails the publication: the post is already on Blurt and the "send to" button can retry.
 */
export async function publishPost(p: NewPost): Promise<PublishResult> {
  const me = auth.me?.user;
  if (!me) throw new Error(t('needLogin'));
  const title = p.title.trim(), community = p.community.trim().toLowerCase();
  const text = p.body.trim();
  if (!title || !text) throw new Error(t('needTitleBody'));
  const body = withFooter(text, auth.me?.user);
  if (community && !COMMUNITY_RE.test(community)) throw new Error(t('communityInvalid'));
  const { primary, tags } = buildTags(p.tagsText, community);
  const permlink = `${slug(title).slice(0, 60) || 'post'}-${Date.now().toString(36)}`;
  const bens = beneficiariesFor(me, { author: me, permlink, title, body: '', created: '', community_name: community || undefined });
  const image = body.match(/!\[[^\]]*\]\((https?:[^)\s]+)/)?.[1];
  const meta = { app: 'blurtdiary/1.0', format: 'markdown', tags, community: community || undefined, image: image ? [image] : undefined, rss_source: p.source && isHttpUrl(p.source) ? p.source.slice(0, 500) : undefined };
  await broadcast([
    ['comment', { parent_author: '', parent_permlink: primary, author: me, permlink, title, body, json_metadata: JSON.stringify(meta) }],
    commentOptions(me, permlink, bens),
  ]);
  // show it on the blog right away; the chain data replaces it on the next load
  const optimistic: Post = { author: me, permlink, title, body, created: new Date().toISOString().slice(0, 19), json_metadata: JSON.stringify(meta),
    children: 0, active_votes: [], payout: 0, is_paidout: false, pending_payout_value: '0.000 BLURT', category: primary, community_name: community || undefined, beneficiaries: bens };
  if (me === USER) state.posts.unshift(optimistic);
  if (p.source && isHttpUrl(p.source)) rememberImported(p.source, permlink);
  const m = await mirrorEverywhere(optimistic, p.images);
  return { permlink, mirrored: m.ok, failed: m.failed };
}

/** Saves the blog settings as @user/blurt-diary-config (created once with payout disabled, then edited in place). */
export async function saveConfig(): Promise<void> {
  const me = auth.me?.user;
  if (!me || me !== USER) throw new Error(t('ownerOnly', { u: USER }));
  const existing = state.configPost;
  const ops: Operation[] = [['comment', {
    parent_author: '', parent_permlink: existing?.parent_permlink ?? 'blurt-diary', author: me, permlink: CONFIG_PERMLINK,
    title: 'Blurt Diary - settings', body: serializeConfig(state.cfg),
    json_metadata: JSON.stringify({ app: 'blurtdiary/1.0', format: 'markdown', tags: ['blurt-diary'] }),
  }]];
  if (!existing) ops.push(commentOptions(me, CONFIG_PERMLINK, [], '0.000 BLURT')); // a settings post should not collect rewards
  await broadcast(ops);
  state.configPost = { parent_permlink: existing?.parent_permlink ?? 'blurt-diary' };
}
