<script setup lang="ts">
import Icon from './Icon.vue';
import { computed } from 'vue';
import { t } from '../lib/i18n';
import { safeUrl } from '../lib/config';
import { href, navigate, state, USER } from '../lib/store';
import UserAvatar from './UserAvatar.vue';
import { favOpen, favs } from '../lib/favs';
import FavList from './FavList.vue';

// category chips only – login, voting power, notifications etc. live in the top bar (TopBar.vue)
const cats = computed(() => state.cfg.cats.filter((c) => c.name.trim()));
const logo = computed(() => safeUrl(state.cfg.logo));
const go = (h: string): void => { if (h) navigate(h); };
</script>
<template>
  <nav class="bar">
    <!-- phone: the blog's logo and name ride along with the bars, so they slide in together when scrolling up -->
    <a class="brandrow" :href="href({})" @click.prevent="go(href({}))">
      <img v-if="logo" class="brand-logo" :src="logo" alt=""><UserAvatar v-else :name="USER" small />
      <b>{{ state.cfg.title ?? state.profile?.name ?? '@' + USER }}</b>
    </a>
    <div class="bar-in">
    <button class="chip fav-chip" :class="{ on: favOpen }" :title="t('favTitle')" :aria-label="t('favTitle')" @click="favOpen = !favOpen"><Icon name="star-fill" /><span v-if="favs.list.length"> {{ favs.list.length }}</span></button>
    <div class="chips">
      <a class="chip" :class="{ on: !state.cat && !state.month && !state.post && !state.view }" :href="href({})" @click.prevent="go(href({}))">{{ t('all') }}</a>
      <a v-for="c in cats" :key="c.id" class="chip" :class="{ on: state.cat === c.id && !state.view }" :title="c.desc" :href="href({ cat: c.id })" @click.prevent="go(href({ cat: c.id }))">{{ c.name }}</a>
    </div>
    <div class="bar-tabs">
      <a class="tab" :class="{ on: state.view === 'stats' }" :href="href({ view: 'stats' })" :title="t('statsTitle')" @click.prevent="go(href({ view: 'stats' }))"><Icon name="chart" /><span class="tab-lbl"> {{ t('statsTitle') }}</span></a>
    </div>
  </div></nav>
  <template v-if="favOpen">
    <div class="backdrop" @click="favOpen = false" />
    <div class="panel fav-panel" @click="favOpen = false"><div class="np-head"><b><Icon name="star-fill" /> {{ t('favTitle') }}</b></div><FavList /></div>
  </template>
</template>
