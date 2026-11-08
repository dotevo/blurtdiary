<script setup lang="ts">
import Icon from './Icon.vue';
import { t } from '../lib/i18n';
import { favs, toggleFav } from '../lib/favs';
import { USER } from '../lib/store';
import UserAvatar from './UserAvatar.vue';
/** The followed blogs. Opening one is a full page load: the blog is chosen by `?user=` when the page starts. */
</script>
<template>
  <ul v-if="favs.list.length" class="fav-list">
    <li v-for="f in favs.list" :key="f.u" :class="{ on: f.u === USER }">
      <a :href="'?user=' + f.u"><UserAvatar :name="f.u" small /><span class="fav-name"><b>{{ f.t || '@' + f.u }}</b><span v-if="f.t" class="mute"> @{{ f.u }}</span></span></a>
      <button class="small" :title="t('favRemove')" :aria-label="t('favRemove')" @click="toggleFav(f.u)"><Icon name="x" /></button>
    </li>
  </ul>
  <p v-else class="mute fav-empty">{{ t('favEmpty') }}</p>
</template>
