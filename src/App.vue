<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loginOpen } from './lib/auth';
import { safeUrl } from './lib/config';
import { lang, t } from './lib/i18n';
import { support } from './lib/support';
import { canMore, href, initBlog, loadMore, navigate, state, USER, visible } from './lib/store';
import { toastMsg } from './lib/toast';
import DocsView from './components/DocsView.vue';
import LangSelect from './components/LangSelect.vue';
import LoginModal from './components/LoginModal.vue';
import NavBar from './components/NavBar.vue';
import TopBar from './components/TopBar.vue';
import PostCard from './components/PostCard.vue';
import PostView from './components/PostView.vue';
import SettingsView from './components/SettingsView.vue';
import SideBar from './components/SideBar.vue';
import SupportModal from './components/SupportModal.vue';
import WriteView from './components/WriteView.vue';
import UserAvatar from './components/UserAvatar.vue';
import StatsView from './components/StatsView.vue';
import WorldView from './components/WorldView.vue';
import ProfileView from './components/ProfileView.vue';
import FavList from './components/FavList.vue';
import NodeSettings from './components/NodeSettings.vue';
import { favs, isFav, toggleFav } from './lib/favs';
import { follow, setFollow } from './lib/follow';

const who = ref('');
onMounted(initBlog);
const reload = (): void => window.location.reload();
const openUser = (): void => { if (who.value.trim()) window.location.search = '?user=' + encodeURIComponent(who.value.trim()); };
const cover = () => safeUrl(state.cfg.cover) || safeUrl(state.profile?.cover_image);
const logo = (): string => safeUrl(state.cfg.logo);
const monthLabel = (m: string): string => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)).toLocaleDateString(lang.value, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const wide = computed(() => state.view === 'write' || state.view === 'settings');
const hasSide = computed(() => !state.loading && !wide.value && state.cfg.sidebar !== 'none');
const wrapClass = computed(() => [wide.value ? 'wide' : `side-${state.cfg.sidebar ?? 'right'}`, hasSide.value ? `pane-${pane.value}` : '']);

/**
 * Phones show one column, so the side panels (recent comments, feed, archive …) would sit below an endless list. Instead the page has two panes,
 * "content" and "panels": tabs at the top, and a swipe left/right switches. Each pane keeps its own scroll position.
 */
const pane = ref<'main' | 'side'>('main');
const scrolls = { main: 0, side: 0 };
async function showPane(p: 'main' | 'side'): Promise<void> {
  if (p === pane.value) return;
  scrolls[pane.value] = window.scrollY; pane.value = p;
  await nextTick(); window.scrollTo(0, scrolls[p]);
}
watch(() => [state.post, state.view, state.cat, state.month], () => { pane.value = 'main'; scrolls.main = 0; });
let t0: { x: number; y: number } | null = null;
const SKIP = 'pre,table,code,textarea,input,select,.chips,.tabs,.cat-bar,.bar,.panel,[contenteditable]'; // things that scroll sideways or take drags themselves
const onStart = (e: TouchEvent): void => { t0 = e.touches.length === 1 && !(e.target as Element).closest?.(SKIP) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; };
const onEnd = (e: TouchEvent): void => {
  if (!t0 || !hasSide.value || window.innerWidth > 860) return;
  const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y; t0 = null;
  if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
  void showPane(dx < 0 ? 'side' : 'main');
};
onMounted(() => { document.addEventListener('touchstart', onStart, { passive: true }); document.addEventListener('touchend', onEnd, { passive: true }); });
onBeforeUnmount(() => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); });
</script>

<template>
  <DocsView v-if="state.view === 'docs'" />
  <!-- no blog: tag pages and posts read from one chain (a tag's address has no user, so every blog leads to the same page) -->
  <template v-else-if="!USER && (state.view === 'world' || state.view === 'profile' || (state.post && state.chain))">
    <TopBar />
    <div class="wrap wide"><main>
      <p><a class="mute" :href="href({})" @click.prevent="navigate(href({}))">Blurt Diary</a></p>
      <WorldView v-if="state.view === 'world'" />
      <ProfileView v-else-if="state.view === 'profile'" />
      <PostView v-else />
    </main></div>
  </template>
  <div v-else-if="!USER" class="center">
    <h1>Blurt Diary</h1><p class="mute">{{ t('enterUser') }}</p>
    <form style="max-width:280px;margin:auto" @submit.prevent="openUser"><input v-model="who" :placeholder="t('userPlaceholder')" autofocus></form>
    <div v-if="favs.list.length" class="fav-landing"><h4>★ {{ t('favTitle') }}</h4><FavList /></div>
    <p><LangSelect /></p>
    <p><a class="mute" :href="href({ view: 'docs' })" @click.prevent="navigate(href({ view: 'docs' }))">{{ t('docs') }}</a></p>
  </div>
  <div v-else-if="state.error" class="center err">
    <p>{{ state.error }}</p><button class="pri" @click="reload">{{ t('retry') }}</button>
  </div>
  <template v-else>
    <TopBar />
    <header class="hero" :class="{ cover: cover() }" :style="cover() ? { backgroundImage: `url('${cover()}')` } : {}">
      <div class="hero-in">
        <img v-if="logo()" class="logo" :src="logo()" alt="">
        <UserAvatar v-else :name="USER" />
        <div>
          <h1><a :href="href({})" @click.prevent="navigate(href({}))">{{ state.cfg.title ?? state.profile?.name ?? '@' + USER }}</a>
            <button class="star" :class="{ on: isFav(USER) }" :title="isFav(USER) ? t('favUnfollow') : t('favFollow')" :aria-label="isFav(USER) ? t('favUnfollow') : t('favFollow')" :aria-pressed="isFav(USER)"
              @click="toggleFav(USER, state.cfg.title ?? state.profile?.name)">{{ isFav(USER) ? '★' : '☆' }}</button>
            <button v-if="follow.state !== 'unknown'" class="small follow" :class="{ on: follow.state === 'yes' }" :disabled="follow.busy" :title="t('followTitle')" @click="setFollow(follow.state !== 'yes')">{{ follow.state === 'yes' ? '✓ ' + t('following') : '＋ ' + t('follow') }}</button></h1>
          <div class="mute">{{ state.cfg.subtitle ?? '@' + USER }}</div>
          <div v-if="state.cfg.links.length" class="hero-links">
            <template v-for="(l, i) in state.cfg.links" :key="i"><a v-if="safeUrl(l.url)" :href="safeUrl(l.url)" target="_blank" rel="noopener noreferrer">{{ l.label }}</a></template>
          </div>
        </div>
      </div>
    </header>
    <NavBar />
    <div class="wrap" :class="wrapClass">
      <div v-if="hasSide" class="pane-tabs" role="tablist">
        <button role="tab" :aria-selected="pane === 'main'" :class="{ on: pane === 'main' }" @click="showPane('main')">📄 {{ t('paneMain') }}</button>
        <button role="tab" :aria-selected="pane === 'side'" :class="{ on: pane === 'side' }" @click="showPane('side')">💬 {{ t('paneSide') }}</button>
      </div>
      <main>
        <div v-if="state.loading" class="grid"><div v-for="i in 6" :key="i" class="card"><div class="skel-img" /><div class="card-b"><div class="skel-line w80" /><div class="skel-line" /><div class="skel-line w60" /></div></div></div>
        <SettingsView v-else-if="state.view === 'settings'" />
        <WriteView v-else-if="state.view === 'write'" />
        <WorldView v-else-if="state.view === 'feed' || state.view === 'world'" />
        <ProfileView v-else-if="state.view === 'profile'" />
        <StatsView v-else-if="state.view === 'stats'" />
        <PostView v-else-if="state.post" />
        <template v-else>
          <h2 v-if="state.month" class="feed-h">{{ monthLabel(state.month) }} <a class="mute month-x" :href="href({})" :title="t('all')" @click.prevent="navigate(href({}))">✕</a></h2>
          <div v-if="visible.length" class="grid"><PostCard v-for="p in visible" :key="p.permlink" :post="p" /></div>
          <div v-else-if="!(state.busy || state.loadingMore)" class="center mute">{{ t('noPosts') }}</div>
          <div v-if="canMore" class="center">
            <button :disabled="state.busy || state.loadingMore" @click="loadMore">{{ state.busy || state.loadingMore ? t('loading') : t('loadMore') }}</button>
          </div>
        </template>
      </main>
      <SideBar v-if="!state.loading && !wide && state.cfg.sidebar !== 'none'" />
    </div>
    <footer class="foot mute">
      <div v-if="state.cfg.footer">{{ state.cfg.footer }}</div>
      {{ t('footer') }} · <a :href="href({ view: 'docs' })" @click.prevent="navigate(href({ view: 'docs' }))">{{ t('docs') }}</a>
      <NodeSettings />
    </footer>
  </template>
  <LoginModal v-if="loginOpen" @close="loginOpen = false" />
  <SupportModal v-if="support.show" />
  <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
</template>
