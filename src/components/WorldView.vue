<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { auth, loggedChains, loginOpen } from '../lib/auth';
import { adapter, CHAINS } from '../lib/chains';
import { t } from '../lib/i18n';
import { href, navigate, openTag, state, tagHref } from '../lib/store';
import { followed, followTag, isFollowedTag, MAX_FOLLOWED_TAGS, normTag, TAG_RE, unfollowTag } from '../lib/tags';
import { chainOn, toggleChain, chainFilter, loadWorldFeed, loadWorldFollowed, loadWorldTag, reloadWorldFeed, reloadWorldTag, worldFeed, worldFeedMore, worldFollowed, worldTag, worldTagMore, type Sort, type WList } from '../lib/world';
import { payoutOf } from '../lib/util';
import MoreSentinel from './MoreSentinel.vue';
import ChainDot from './ChainDot.vue';
import WorldCard from './WorldCard.vue';

/**
 * Logged-in reading side: Feed (accounts you follow, on every chain you are logged in to) and Tags (posts with a tag on every chain; tags can be followed).
 * Followed tags are private to this browser. The blog itself is not touched.
 */
const tab = computed<'feed' | 'tags'>(() => (state.view === 'feed' ? 'feed' : state.tab === 'tags' || state.tag ? 'tags' : 'feed'));
const tag = computed(() => (TAG_RE.test(normTag(state.tag)) ? normTag(state.tag) : ''));
/**
 * Ordering. Tags: the node's own rankings (new / hot / trending), several chains interleaved by position. The feed of followed accounts exists on the nodes
 * only as "newest first", so there the second choice re-orders what is loaded by payout. The choice is remembered on this device.
 */
const SK = 'bd-world-sort';
const readSort = (): { tags: Sort; feed: 'created' | 'payout' } => {
  try { const o = JSON.parse(localStorage.getItem(SK) ?? '{}'); return { tags: ['created', 'hot', 'trending'].includes(o.tags) ? o.tags : 'created', feed: o.feed === 'payout' ? 'payout' : 'created' }; } catch { return { tags: 'created', feed: 'created' }; }
};
const sorts = ref(readSort());
const setSort = (kind: 'tags' | 'feed', v: string): void => { (sorts.value as Record<string, string>)[kind] = v; try { localStorage.setItem(SK, JSON.stringify(sorts.value)); } catch { /* ignore */ } if (kind === 'tags') reload(); };
const newTag = ref(''); const tagMsg = ref('');
const goTab = (x: 'feed' | 'tags'): void => navigate(href({ view: 'world', tab: x }));
const goTag = (x: string): void => openTag(x);

watch([tab, tag, () => followed.tags.join(), () => auth.me?.user, () => chainFilter.off.join(), () => loggedChains().length], () => {
  if (tag.value) document.title = `#${tag.value} – Blurt Diary`;
  if (tab.value === 'feed') { if (loggedChains().length) void loadWorldFeed(); }
  else if (tag.value) void loadWorldTag(tag.value, false, sorts.value.tags);
  else if (followed.tags.length) void loadWorldFollowed(followed.tags);
}, { immediate: true });

const addTag = (): void => {
  const n = normTag(newTag.value); tagMsg.value = '';
  if (!n) return;
  if (!TAG_RE.test(n)) { tagMsg.value = t('tagBad'); return; }
  if (!followTag(n)) { tagMsg.value = t('tagsFull', { n: MAX_FOLLOWED_TAGS }); return; }
  newTag.value = '';
};
const list = computed<WList>(() => (tab.value === 'feed' ? worldFeed : tag.value ? worldTag : worldFollowed));
const items = computed(() => (tab.value === 'feed' && sorts.value.feed === 'payout' ? [...list.value.items].sort((a, b) => payoutOf(b.lead) - payoutOf(a.lead)) : list.value.items));
const more = computed(() => (tab.value === 'feed' ? worldFeedMore() : tag.value ? worldTagMore() : false));
const loadMore = (): void => { void (tab.value === 'feed' ? loadWorldFeed(true) : loadWorldTag(tag.value, true, sorts.value.tags)); };
const reload = (): void => { void (tab.value === 'feed' ? reloadWorldFeed() : tag.value ? reloadWorldTag(sorts.value.tags) : loadWorldFollowed(followed.tags, true)); };
/** Chains that failed (e.g. a node without that listing) – shown as a quiet note, never as an empty result. */
const problems = computed(() => Object.entries(list.value.sources).filter(([, s]) => s.error).map(([c, s]) => `${c.includes('@') ? c.split('@')[0] + ' @ ' + adapter(c.split('@')[1]).name : adapter(c).name}: ${s.error}`));
const feedFrom = computed(() => loggedChains());
/** The chains the reader can switch between here: the logged-in ones in the feed, all of them in tags. */
const among = computed(() => (tab.value === 'feed' ? feedFrom.value.map((c) => c.id) : CHAINS.map((c) => c.id)));
const feedShown = computed(() => feedFrom.value.filter((c) => chainOn(c.id)));
</script>
<template>
  <section class="world">
    <div class="tabs world-tabs" v-if="auth.me || !tag">
      <button :class="{ pri: tab === 'feed' }" @click="goTab('feed')">📰 {{ t('feedTitle') }}</button>
      <button :class="{ pri: tab === 'tags' }" @click="goTab('tags')"># {{ t('tagsTab') }}</button>
      <span class="grow" />
      <button class="small" :disabled="list.loading" :title="t('retry')" @click="reload">↻</button>
    </div>

    <!-- FEED -->
    <template v-if="tab === 'feed'">
      <div v-if="!auth.me && !feedFrom.length" class="center"><p class="mute">{{ t('feedLogin') }}</p><button class="pri" @click="loginOpen = true">{{ t('login') }}</button></div>
      <template v-else>
        <div class="sortbar"><button v-for="k in (['created', 'payout'] as const)" :key="k" class="small" :class="{ pri: sorts.feed === k }" @click="setSort('feed', k)">{{ t(k === 'created' ? 'sortNew' : 'sortPayoutLoaded') }}</button></div>
        <div class="mute help">{{ t('feedFrom') }} <span v-for="c in (feedShown.length ? feedShown : feedFrom)" :key="c.id" class="wf-chain"><ChainDot :chain="c.id" /> @{{ auth.sessions[c.id].user }}</span></div>
      </template>
    </template>

    <!-- TAGS -->
    <template v-else>
      <div v-if="tag" class="sortbar"><button v-for="k in (['created', 'hot', 'trending'] as const)" :key="k" class="small" :class="{ pri: sorts.tags === k }" @click="setSort('tags', k)">{{ t(k === 'created' ? 'sortNew' : k === 'hot' ? 'sortHot' : 'sortTrending') }}</button></div>
      <div v-if="tag" class="tag-head">
        <h2 class="feed-h">#{{ tag }} <span class="mute help">{{ t('tagOnAll') }}</span></h2>
        <template v-if="auth.me || feedFrom.length">
          <button v-if="!isFollowedTag(tag)" class="small" @click="followTag(tag)">☆ {{ t('tagFollow') }}</button>
          <button v-else class="small pri" @click="unfollowTag(tag)">★ {{ t('tagFollowing') }}</button>
        </template>
        <a class="mute" :href="href({ view: 'world', tab: 'tags' })" @click.prevent="goTab('tags')">✕</a>
      </div>
      <template v-else>
        <div v-if="!auth.me && !feedFrom.length" class="center"><p class="mute">{{ t('tagsLogin') }}</p><button class="pri" @click="loginOpen = true">{{ t('login') }}</button></div>
        <template v-else>
          <div class="chips">
            <a v-for="x in followed.tags" :key="x" class="tag chip" :href="tagHref(x)" @click.prevent="goTag(x)">#{{ x }}</a>
            <span v-if="!followed.tags.length" class="mute help">{{ t('tagsNone') }}</span>
          </div>
          <form class="tag-add" @submit.prevent="addTag"><input v-model="newTag" :placeholder="t('tagAddPh')" autocapitalize="off" maxlength="33"><button class="small" :disabled="!newTag.trim()">{{ t('tagAdd') }}</button></form>
          <div v-if="tagMsg" class="badtxt help">{{ tagMsg }}</div>
          <div v-if="followed.tags.length" class="mute help">{{ t('tagsAllFollowed') }}</div>
          <div class="mute help">{{ t('tagsPrivate') }}</div>
        </template>
      </template>
    </template>

    <div v-if="among.length > 1 && (tab === 'feed' ? feedFrom.length : tag || followed.tags.length)" class="chainbar">
      <button v-for="id in among" :key="id" class="small" :class="{ off: !chainOn(id) }" :aria-pressed="chainOn(id)" :title="t('chainFilter')" @click="toggleChain(id, among)"><ChainDot :chain="id" /> {{ adapter(id).name }}</button>
    </div>
    <div v-for="p in problems" :key="p" class="mute help badtxt">⚠ {{ p }}</div>
    <div v-if="items.length" class="grid"><WorldCard v-for="it in items" :key="it.key" :item="it" /></div>
    <div v-else-if="list.loading" class="mute center">{{ t('loading') }}</div>
    <div v-else-if="(tab === 'feed' && feedFrom.length) || tag || followed.tags.length" class="mute center">{{ t(tab === 'feed' ? 'feedEmpty' : 'noPosts') }}</div>
    <MoreSentinel v-if="list.items.length" :can="more" :loading="list.loading" @more="loadMore" />
  </section>
</template>
