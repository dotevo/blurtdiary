<script setup lang="ts">
import Icon from './Icon.vue';
import { computed, nextTick, provide, reactive, ref, watch } from 'vue';
import { auth, loginOpen } from '../lib/auth';
import { benLabel, beneficiariesFor } from '../lib/ben';
import { adapter, CHAINS, type ChainThread } from '../lib/chains';
import { t } from '../lib/i18n';
import { toggleVoteAll, votedAll } from '../lib/actions';
import PostNav from './PostNav.vue';
import { loadNeighbors } from '../lib/neighbors';
import { useImageField } from '../lib/useImageField';
import { applyResult, canMirrorPost, editEverywhere, chainsOf, isUnverified, threadAccount, commentTargets, describeResult, loadChainThread, mergeThreads, mirrorChains, mirrorPost, sendComment, versionsDiffer } from '../lib/mirror';
import { accountsOf, ownerOf } from '../lib/known';
import { href, navigate, openProfile, openTag, profileHref, postParam, postRef, state, tagHref, USER } from '../lib/store';
import { fmtDate, payoutOf, payoutTitle, renderMd, rootOf, tagsOf, thumbOf } from '../lib/util';
import { toast } from '../lib/toast';
import type { Post } from '../lib/types';
import ChainBadges, { type BadgeItem } from './ChainBadges.vue';
import ChainDot from './ChainDot.vue';
import CommentNode from './CommentNode.vue';
import DevTipToggle from './DevTipToggle.vue';
import VersionsModal from './VersionsModal.vue';
import VotesModal from './VotesModal.vue';

/**
 * Blurt answers first (primary chain; the post page appears as soon as it does). Then, for the blog owner's posts, every
 * other configured chain is asked for the same permlink in parallel; their discussions are merged into one comment tree.
 */
const post = ref<Post | null>(null);                  // the Blurt copy
const threads = reactive<Record<string, ChainThread>>({});
provide('threads', threads);                          // CommentNode adds freshly sent copies here
const loading = ref(true);
const body = ref('');
const sending = ref(false);
const sendingChain = ref('');
const versionsOpen = ref(false);
const votesOpen = ref(false);

const merged = computed(() => mergeThreads(threads));
const readMin = computed(() => Math.max(1, Math.round((post.value?.body.split(/\s+/).length ?? 0) / 200)));
const benText = computed(() => (auth.me && post.value ? benLabel(beneficiariesFor(auth.me.user, post.value)) : ''));
const catFor = (tag: string) => state.cfg.cats.find((c) => c.tags.includes(tag));
const loggedIn = computed(() => Object.keys(auth.sessions).length > 0);
const targets = computed(() => commentTargets(merged.value.root));
const targetNote = computed(() => targets.value.map((c) => `@${auth.sessions[c.id].user} (${c.name})`).join(', '));
const voteTitle = computed(() => Object.entries(merged.value.root).map(([c, p]) => `${adapter(c).name}: ♥ ${p.active_votes?.length ?? 0}`).join('\n'));
/** True while at least one other chain has not answered yet (the spinner next to the comments). */
const checking = computed(() => mirrored.value && mirrorChains().some((c) => !threads[c.id] || threads[c.id].status === 'loading'));
const payoutChains = computed(() => chainsOf(merged.value.root)); // rewards of every chain that has a copy
const postDiffers = computed(() => versionsDiffer(merged.value.root, true));
/** The blog owner, logged in on Blurt, may edit the post; if the copies differ they may also copy the Blurt version over the other chains. */
const isOwner = computed(() => !fchain.value && !!post.value && post.value.author === USER && auth.me?.user === USER && (post.value.depth ?? 0) === 0);
const commentTa = ref<HTMLTextAreaElement | null>(null); const commentFile = ref<HTMLInputElement | null>(null);
const cimg = useImageField(body, commentTa);
const syncing = ref(false);
async function syncCopies(): Promise<void> {
  const root = merged.value.root.blurt; if (!root || syncing.value) return;
  if (!window.confirm(t('syncConfirm'))) return;
  syncing.value = true; const my = seq;
  try {
    const r = await editEverywhere(root);
    const failed = Object.entries(r.failed).map(([c, e]) => `${c} (${e})`);
    toast(failed.length ? t('postEditedPartial', { fail: failed.join(', ') }) : t('postEdited'));
    if (my === seq) for (const c of mirrorChains()) await loadChainThread(guard(my), c.id, root.permlink);
  } catch (e) { toast((e as Error).message); }
  syncing.value = false;
}
/** A post read from another chain (`?chain=hive`): it has no Blurt copy, so it is shown from that chain only. */
const fchain = computed(() => (state.chain && state.chain !== 'blurt' && CHAINS.some((c) => c.id === state.chain) ? state.chain : ''));
const mirrored = computed(() => !fchain.value && !!post.value && post.value.author === USER && (post.value.depth ?? 0) === 0 && mirrorChains().length > 0);

/** Copies found on other chains only by NAME (the blog declares no accounts there, or the author of a read post is unknown): not verified to be the same person. */
const guessed = ref(false);
const unverifiedNote = computed(() => (fchain.value ? guessed.value && Object.entries(threads).some(([k, v]) => k !== fchain.value && v.status === 'found')
  : mirrored.value && mirrorChains().some((c) => isUnverified(c.id) && threads[c.id]?.status === 'found')));
const badges = computed<BadgeItem[]>(() => mirrored.value ? [{ id: 'blurt', name: 'Blurt' }, ...mirrorChains()].map((c) => {
  const th = threads[c.id]; const account = threadAccount(c.id);
  return { id: c.id, name: c.name, status: th?.status ?? 'loading', error: th?.error, account, url: account && post.value ? adapter(c.id).postUrl(account, post.value.permlink) : undefined,
    canSend: !!post.value && canMirrorPost(c.id, post.value, threads), sending: sendingChain.value === c.id };
}) : []);

/**
 * Opening another post while the previous one is still loading must not let the old answers land in the new post's threads
 * (that mixed two posts and could send a comment to the wrong one). Every load has a number; writes of an outdated load are dropped.
 */
let seq = 0;
const guard = (my: number): Record<string, ChainThread> => new Proxy(threads, { set: (t, k, v) => { if (my === seq) Reflect.set(t, k, v); return true; } });

async function load(): Promise<void> {
  const my = ++seq; const g = guard(my);
  loading.value = true;
  Object.keys(threads).forEach((k) => delete threads[k]);
  const { author, permlink } = postRef(state.post);
  if (fchain.value) {
    const fc = fchain.value;
    const fth = await adapter(fc).getThread(author, permlink);
    if (my !== seq) return;
    const froot = fth.status === 'found' ? fth.root! : null;
    if (froot && (froot.depth ?? 0) > 0) {
      // a comment (a notification from this chain) -> its root post, the comment highlighted
      const r = rootOf(froot);
      if (r) { navigate(href({ post: postParam(r.author, r.permlink), chain: fc, c: `${author}/${permlink}` }), true); return; }
    }
    // whose post is it? Our own account on this chain, or an account that a Blurt blog we have visited declared as its owner's
    const known = !froot ? undefined : auth.me && froot.author === auth.sessions[fc]?.user ? auth.me.user : ownerOf(fc, froot.author);
    const owner = froot ? known ?? froot.author : undefined; // an unknown author: the same name on the other chains (not verified, see `guessed`)
    guessed.value = !!froot && !known;
    if (froot && owner) {
      // the Blurt copy (the source of truth) shows the whole discussion of all chains
      const bt = await adapter('blurt').getThread(owner, froot.permlink);
      if (my !== seq) return;
      if (bt.status === 'found') { navigate(href({ post: postParam(owner, froot.permlink), c: state.focus }), true); return; }
    }
    post.value = froot;
    if (froot) threads[fc] = fth;
    loading.value = false;
    // no Blurt copy: still look for the same permlink on the owner's other chains so the thread is complete
    if (froot && owner) {
      const accs = !known ? Object.fromEntries(CHAINS.map((c) => [c.id, owner])) : owner === auth.me?.user ? Object.fromEntries(CHAINS.map((c) => [c.id, auth.sessions[c.id]?.user])) : accountsOf(owner);
      for (const c of CHAINS) if (c.id !== fc && c.id !== 'blurt' && accs[c.id]) void loadChainThread(g, c.id, froot.permlink, accs[c.id]);
    }
    void scrollToFocus();
    return;
  }
  const th = await adapter('blurt').getThread(author, permlink);
  if (my !== seq) return;
  const root = th.status === 'found' ? th.root! : null;
  const isComment = !!root && (root.depth ?? 0) > 0;
  if (root && (isComment || root.author !== USER)) {
    // a comment (e.g. from a notification) -> its root post, with the comment highlighted; a post of somebody else -> that author's blog
    const r = isComment ? rootOf(root) : { author: root.author, permlink: root.permlink };
    if (r) {
      const focus = isComment ? `${author}/${permlink}` : '';
      if (r.author === USER) { if (isComment) { navigate(href({ post: postParam(r.author, r.permlink), c: focus }), true); return; } }
      else { window.location.replace(`?user=${encodeURIComponent(r.author)}&post=${encodeURIComponent(r.permlink)}${focus ? '&c=' + encodeURIComponent(focus) : ''}`); return; }
    }
  }
  post.value = root;
  if (root && root.author === USER && !(root.depth ?? 0)) void loadNeighbors(root);
  if (root) threads.blurt = th;
  loading.value = false;
  if (root && mirrored.value) for (const c of mirrorChains()) void loadChainThread(g, c.id, permlink); // parallel, filled in as they answer
  void scrollToFocus();
}
watch(() => [state.post, state.chain], load, { immediate: true });
// logging in to another chain while the post is open: look the post up there too
watch(() => mirrorChains().map((c) => c.id).join(), () => {
  if (post.value && mirrored.value) for (const c of mirrorChains()) if (!threads[c.id]) void loadChainThread(guard(seq), c.id, post.value.permlink);
});
watch(() => state.focus, () => { void scrollToFocus(); });
const retry = (chain: string): void => { if (post.value) void loadChainThread(guard(seq), chain, post.value.permlink); };

async function scrollToFocus(): Promise<void> {
  if (!state.focus || loading.value) return;
  await nextTick();
  const el = document.querySelector<HTMLElement>(`[data-ck="${CSS.escape(state.focus)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); // restart the highlight animation
}

async function send(): Promise<void> {
  if (!post.value) return;
  if (!loggedIn.value) { loginOpen.value = true; return; }
  const text = body.value.trim(); if (!text || sending.value) return;
  if (!targets.value.length) { toast(t('noTargets')); loginOpen.value = true; return; }
  // every chain's copy must be this very post (same permlink); anything else means the page is in a mixed state – never send then
  const root = merged.value.root; const my = seq;
  if (Object.values(root).some((p) => p.permlink !== post.value!.permlink)) { toast(t('mixedPost')); void load(); return; }
  sending.value = true;
  const res = await sendComment(root, text, cimg.images.value);
  if (my === seq) { applyResult(threads, root, res); if (Object.keys(res.ok).length) { body.value = ''; cimg.images.value = {}; } }
  toast(describeResult(res, t('commentSent')));
  sending.value = false;
}
async function sendPost(chain: string): Promise<void> {
  if (!post.value) return;
  sendingChain.value = chain;
  const my = seq; const sent = post.value;
  try { await mirrorPost(chain, sent); toast(t('postSentTo', { c: adapter(chain).name })); await loadChainThread(guard(my), chain, sent.permlink); }
  catch (e) { toast((e as Error).message); }
  sendingChain.value = '';
}
</script>

<template>
  <div v-if="loading" class="article"><div class="skel-img" /><div class="art-in"><div class="skel-line w60" /><div class="skel-line" /><div class="skel-line" /><div class="skel-line w80" /></div></div>
  <div v-else-if="!post" class="center">{{ t('postNotFound') }}</div>
  <div v-else class="article">
    <div v-if="thumbOf(post)" class="thumb hero-img" :style="{ backgroundImage: `url('${thumbOf(post)}')` }" />
    <div class="art-in">
      <a class="back" :href="href({})" @click.prevent="navigate(href({}))">{{ t('allPosts') }}</a>
      <div v-if="post.author !== USER" class="mute">{{ t('postOf', { a: post.author }) }} · <a class="au" :href="profileHref(post.author, fchain || 'blurt')" @click.prevent="openProfile(post.author, fchain || 'blurt')">{{ t('profileOpen') }}</a></div>
      <h1>{{ post.title }}</h1>
      <div class="mute">{{ fmtDate(post.created) }} · {{ t('readMin', { n: readMin }) }} · <template v-for="x in payoutChains" :key="x.id"><span class="pay" :title="payoutTitle(merged.root[x.id])"><ChainDot v-if="payoutChains.length > 1" :chain="x.id" /> {{ payoutOf(merged.root[x.id]).toFixed(3) }} {{ x.payoutSymbol }}</span>{{ ' ' }}</template></div>
      <ChainBadges v-if="badges.length" :items="badges" @retry="retry" @send="sendPost" />
      <div v-if="unverifiedNote" class="mute help unverified"><Icon name="warn" /> {{ t('unverifiedNote') }}</div>
      <div v-if="postDiffers" class="mute"><a href="#" class="vdiff" @click.prevent="versionsOpen = true"><Icon name="warn" /> {{ t('versionsDiffer') }}</a><template v-if="isOwner && merged.root.blurt"> · <button class="small" :disabled="syncing" @click="syncCopies">{{ t('syncCopies') }}</button></template></div>
      <div class="md post-body" v-html="renderMd(post.body)" />
      <div class="actions">
        <button :class="{ pri: votedAll(merged.root) }" :title="voteTitle" @click="toggleVoteAll(merged.root)"><Icon name="heart" /> {{ post.active_votes?.length ?? 0 }}</button>
        <a v-if="isOwner" class="btn small" :href="href({ view: 'write', edit: post.permlink })" @click.prevent="navigate(href({ view: 'write', edit: post.permlink }))"><Icon name="pen" /> {{ t('editPost') }}</a>
        <button class="vinfo" :title="t('votesTitle')" :aria-label="t('votesTitle')" @click="votesOpen = true">ⓘ</button>
        <template v-for="tag in tagsOf(post)" :key="tag">
          <a v-if="catFor(tag) && !fchain" class="tag" :href="href({ cat: catFor(tag)!.id })" @click.prevent="navigate(href({ cat: catFor(tag)!.id }))">#{{ tag }}</a>
          <a v-else class="tag" :href="tagHref(tag)" :title="t('tagOnAll')" @click.prevent="openTag(tag)">#{{ tag }}</a>
        </template>
      </div>
      <PostNav v-if="!fchain && post.author === USER && !(post.depth ?? 0)" />
      <h3>{{ t('comments', { n: post.children ?? 0 }) }} <span v-if="checking" class="spinner" role="status" :aria-label="t('checkingChains')" :title="t('checkingChains')" /></h3>
      <div v-if="checking" class="mute help">{{ t('checkingChains') }}</div>
      <template v-if="loggedIn">
        <textarea ref="commentTa" v-model="body" rows="3" :placeholder="t('addComment')" @paste="cimg.onPaste" @drop="cimg.onDrop" @dragover.prevent />
        <div class="mute target-note">{{ targets.length ? t('willSendTo', { list: targetNote }) : t('noTargets') }}</div>
        <div class="actions"><button class="pri" :disabled="sending || cimg.uploading.value" @click="send">{{ t('send') }}</button>
          <input ref="commentFile" type="file" accept="image/*" hidden @change="cimg.onPick">
          <button :disabled="cimg.uploading.value" @click="commentFile?.click()"><Icon name="image" /> {{ cimg.uploading.value ? t('uploading') : t('uploadImage') }}</button></div>
        <DevTipToggle :list="benText" />
      </template>
      <p v-else class="mute">{{ t('loginToComment') }}</p>
      <CommentNode v-for="n in merged.nodes" :key="n.permlink" :node="n" :parent="merged.root" :depth="0" />
      <VotesModal v-if="votesOpen" :versions="merged.root" @close="votesOpen = false" />
      <VersionsModal v-if="versionsOpen" :versions="merged.root" @close="versionsOpen = false" />
    </div>
  </div>
</template>
