<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { auth, loggedChains, loginOpen } from '../lib/auth';
import { adapter } from '../lib/chains';
import { t } from '../lib/i18n';
import { href, navigate, state } from '../lib/store';
import { followed, followTag, isFollowedTag, MAX_FOLLOWED_TAGS, normTag, TAG_RE, unfollowTag } from '../lib/tags';
import { loadWorldFeed, loadWorldFollowed, loadWorldTag, reloadWorldFeed, reloadWorldTag, worldFeed, worldFeedMore, worldFollowed, worldTag, worldTagMore, type WList } from '../lib/world';
import ChainDot from './ChainDot.vue';
import WorldCard from './WorldCard.vue';

/**
 * Logged-in reading side: Feed (accounts you follow, on every chain you are logged in to) and Tags (posts with a tag on every chain; tags can be followed).
 * Followed tags are private to this browser. The blog itself is not touched.
 */
const tab = computed<'feed' | 'tags'>(() => (state.view === 'feed' ? 'feed' : state.tab === 'tags' || state.tag ? 'tags' : 'feed'));
const tag = computed(() => (TAG_RE.test(normTag(state.tag)) ? normTag(state.tag) : ''));
const newTag = ref(''); const tagMsg = ref('');
const goTab = (x: 'feed' | 'tags'): void => navigate(href({ view: 'world', tab: x }));
const goTag = (x: string): void => navigate(href({ view: 'world', tab: 'tags', tag: x }));

watch([tab, tag, () => followed.tags.join(), () => auth.me?.user], () => {
  if (tab.value === 'feed') { if (loggedChains().length) void loadWorldFeed(); }
  else if (tag.value) void loadWorldTag(tag.value);
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
const more = computed(() => (tab.value === 'feed' ? worldFeedMore() : tag.value ? worldTagMore() : false));
const loadMore = (): void => { void (tab.value === 'feed' ? loadWorldFeed(true) : loadWorldTag(tag.value, true)); };
const reload = (): void => { void (tab.value === 'feed' ? reloadWorldFeed() : tag.value ? reloadWorldTag() : loadWorldFollowed(followed.tags, true)); };
/** Chains that failed (e.g. a node without that listing) – shown as a quiet note, never as an empty result. */
const problems = computed(() => Object.entries(list.value.sources).filter(([, s]) => s.error).map(([c, s]) => `${c.includes('@') ? c.split('@')[0] + ' @ ' + adapter(c.split('@')[1]).name : adapter(c).name}: ${s.error}`));
const feedFrom = computed(() => loggedChains());
</script>
<template>
  <section class="world">
    <div class="tabs world-tabs">
      <button :class="{ pri: tab === 'feed' }" @click="goTab('feed')">📰 {{ t('feedTitle') }}</button>
      <button :class="{ pri: tab === 'tags' }" @click="goTab('tags')"># {{ t('tagsTab') }}</button>
      <span class="grow" />
      <button class="small" :disabled="list.loading" :title="t('retry')" @click="reload">↻</button>
    </div>

    <!-- FEED -->
    <template v-if="tab === 'feed'">
      <div v-if="!auth.me && !feedFrom.length" class="center"><p class="mute">{{ t('feedLogin') }}</p><button class="pri" @click="loginOpen = true">{{ t('login') }}</button></div>
      <template v-else>
        <div class="mute help">{{ t('feedFrom') }} <span v-for="c in feedFrom" :key="c.id" class="wf-chain"><ChainDot :chain="c.id" /> @{{ auth.sessions[c.id].user }}</span></div>
      </template>
    </template>

    <!-- TAGS -->
    <template v-else>
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
            <a v-for="x in followed.tags" :key="x" class="tag chip" :href="href({ view: 'world', tab: 'tags', tag: x })" @click.prevent="goTag(x)">#{{ x }}</a>
            <span v-if="!followed.tags.length" class="mute help">{{ t('tagsNone') }}</span>
          </div>
          <form class="tag-add" @submit.prevent="addTag"><input v-model="newTag" :placeholder="t('tagAddPh')" autocapitalize="off" maxlength="33"><button class="small" :disabled="!newTag.trim()">{{ t('tagAdd') }}</button></form>
          <div v-if="tagMsg" class="badtxt help">{{ tagMsg }}</div>
          <div v-if="followed.tags.length" class="mute help">{{ t('tagsAllFollowed') }}</div>
          <div class="mute help">{{ t('tagsPrivate') }}</div>
        </template>
      </template>
    </template>

    <div v-for="p in problems" :key="p" class="mute help badtxt">⚠ {{ p }}</div>
    <div v-if="list.items.length" class="grid"><WorldCard v-for="it in list.items" :key="it.key" :item="it" /></div>
    <div v-else-if="list.loading" class="mute center">{{ t('loading') }}</div>
    <div v-else-if="(tab === 'feed' && feedFrom.length) || tag || followed.tags.length" class="mute center">{{ t(tab === 'feed' ? 'feedEmpty' : 'noPosts') }}</div>
    <div v-if="list.items.length && more" class="center"><button :disabled="list.loading" @click="loadMore">{{ list.loading ? t('loading') : t('loadMore') }}</button></div>
  </section>
</template>
