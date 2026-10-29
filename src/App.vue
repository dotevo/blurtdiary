<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { loginOpen } from './lib/auth';
import { safeUrl } from './lib/config';
import { t } from './lib/i18n';
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
import FavList from './components/FavList.vue';
import { favs, isFav, toggleFav } from './lib/favs';

const who = ref('');
onMounted(initBlog);
const reload = (): void => window.location.reload();
const openUser = (): void => { if (who.value.trim()) window.location.search = '?user=' + encodeURIComponent(who.value.trim()); };
const cover = () => safeUrl(state.cfg.cover) || safeUrl(state.profile?.cover_image);
const logo = (): string => safeUrl(state.cfg.logo);
const wide = computed(() => state.view === 'write' || state.view === 'settings');
const wrapClass = computed(() => (wide.value ? 'wide' : `side-${state.cfg.sidebar ?? 'right'}`));
</script>

<template>
  <DocsView v-if="state.view === 'docs'" />
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
              @click="toggleFav(USER, state.cfg.title ?? state.profile?.name)">{{ isFav(USER) ? '★' : '☆' }}</button></h1>
          <div class="mute">{{ state.cfg.subtitle ?? '@' + USER }}</div>
          <div v-if="state.cfg.links.length" class="hero-links">
            <template v-for="(l, i) in state.cfg.links" :key="i"><a v-if="safeUrl(l.url)" :href="safeUrl(l.url)" target="_blank" rel="noopener noreferrer">{{ l.label }}</a></template>
          </div>
        </div>
      </div>
    </header>
    <NavBar />
    <div class="wrap" :class="wrapClass">
      <main>
        <div v-if="state.loading" class="grid"><div v-for="i in 6" :key="i" class="card"><div class="skel-img" /><div class="card-b"><div class="skel-line w80" /><div class="skel-line" /><div class="skel-line w60" /></div></div></div>
        <SettingsView v-else-if="state.view === 'settings'" />
        <WriteView v-else-if="state.view === 'write'" />
        <PostView v-else-if="state.post" />
        <template v-else>
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
    </footer>
  </template>
  <LoginModal v-if="loginOpen" @close="loginOpen = false" />
  <SupportModal v-if="support.show" />
  <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
</template>
