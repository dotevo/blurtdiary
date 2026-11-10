import { auth, broadcast } from './auth';
import { isHttpUrl, rememberImported } from './rss';
import { beneficiariesFor, commentOptions } from './ben';
import { CONFIG_PERMLINK, parseTags, serializeConfig } from './config';
import { t } from './i18n';
import { editEverywhere, mirrorEverywhere } from './mirror';
import type { ImageMap } from './upload';
import { state, USER } from './store';
import { withFooter } from './settings';
import { meta, slug, tagsOf } from './util';
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

export interface EditResult { updated: string[]; missing: string[]; failed: Record<string, string> }
/**
 * Edits one of the owner's posts: Blurt first (the source of truth), then the copies on the other chains. The category (parent_permlink) and the reward
 * settings cannot be changed after publishing, so they stay; title, text and the other tags can. A failing mirror never fails the edit.
 */
export async function editPost(old: Post, e: { title: string; body: string; tagsText: string }, images: ImageMap = {}): Promise<EditResult> {
  const me = auth.sessions.blurt?.user;
  if (!me || me !== old.author) throw new Error(t('ownerOnly', { u: old.author }));
  const title = e.title.trim(), body = e.body.trim();
  if (!title || !body) throw new Error(t('needTitleBody'));
  const primary = old.parent_permlink || old.category || tagsOf(old)[0] || 'blurt';
  const { tags } = buildTags(e.tagsText, primary);
  const image = body.match(/!\[[^\]]*\]\((https?:[^)\s]+)/)?.[1];
  const m = { ...meta(old), app: 'blurtdiary/1.0', format: 'markdown', tags, image: image ? [image] : undefined };
  await broadcast([['comment', { parent_author: '', parent_permlink: primary, author: me, permlink: old.permlink, title, body, json_metadata: JSON.stringify(m) }]]);
  const edited: Post = { ...old, title, body, json_metadata: JSON.stringify(m) };
  const i = state.posts.findIndex((x) => x.permlink === old.permlink);
  if (i >= 0) state.posts[i] = { ...state.posts[i], title, body, json_metadata: edited.json_metadata };
  const r = await editEverywhere(edited, images);
  return { updated: r.ok, missing: r.missing, failed: r.failed };
}
