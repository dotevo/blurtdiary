<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../lib/i18n';
import { href, navigate, state } from '../lib/store';
import { favOpen, favs } from '../lib/favs';
import FavList from './FavList.vue';

// category chips only – login, voting power, notifications etc. live in the top bar (TopBar.vue)
const cats = computed(() => state.cfg.cats.filter((c) => c.name.trim()));
const go = (h: string): void => { if (h) navigate(h); };
</script>
<template>
  <nav class="bar"><div class="bar-in">
    <button class="chip fav-chip" :class="{ on: favOpen }" :title="t('favTitle')" :aria-label="t('favTitle')" @click="favOpen = !favOpen">★<span v-if="favs.list.length"> {{ favs.list.length }}</span></button>
    <div class="chips">
      <a class="chip" :class="{ on: !state.cat && !state.post && !state.view }" :href="href({})" @click.prevent="go(href({}))">{{ t('all') }}</a>
      <a v-for="c in cats" :key="c.id" class="chip" :class="{ on: state.cat === c.id && !state.view }" :title="c.desc" :href="href({ cat: c.id })" @click.prevent="go(href({ cat: c.id }))">{{ c.name }}</a>
    </div>
  </div></nav>
  <template v-if="favOpen">
    <div class="backdrop" @click="favOpen = false" />
    <div class="panel fav-panel" @click="favOpen = false"><div class="np-head"><b>★ {{ t('favTitle') }}</b></div><FavList /></div>
  </template>
</template>
