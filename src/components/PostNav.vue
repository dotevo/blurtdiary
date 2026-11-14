<script setup lang="ts">
import Icon from './Icon.vue';
import { t } from '../lib/i18n';
import { nav } from '../lib/neighbors';
import { href, navigate } from '../lib/store';
import { excerpt, fmtDate } from '../lib/util';

/** "Keep reading": the next (newer) and the previous (older) post of the blog, with their titles. */
const go = (p: string): void => { navigate(href({ post: p })); window.scrollTo(0, 0); };
const peek = (b: string): string => { const x = excerpt(b); return x.length > 110 ? x.slice(0, 110).trimEnd() + '…' : x; };
</script>
<template>
  <nav v-if="nav.older || nav.newer || nav.loading" class="postnav" :aria-label="t('keepReading')">
    <a v-if="nav.older" class="pn pn-prev" :href="href({ post: nav.older.permlink })" @click.prevent="go(nav.older.permlink)">
      <span class="pn-dir"><Icon name="up" class="pn-ico l" /> {{ t('prevPost') }}</span>
      <b class="pn-title">{{ nav.older.title }}</b>
      <span class="pn-ex mute">{{ peek(nav.older.body) }}</span>
      <span class="pn-date mute">{{ fmtDate(nav.older.created) }}</span>
    </a>
    <span v-else-if="nav.loading" class="pn pn-prev pn-wait mute"><span class="spinner" aria-hidden="true" /> {{ t('prevPost') }}</span>
    <span v-else class="pn-gap" />
    <a v-if="nav.newer" class="pn pn-next" :href="href({ post: nav.newer.permlink })" @click.prevent="go(nav.newer.permlink)">
      <span class="pn-dir">{{ t('nextPost') }} <Icon name="up" class="pn-ico r" /></span>
      <b class="pn-title">{{ nav.newer.title }}</b>
      <span class="pn-ex mute">{{ peek(nav.newer.body) }}</span>
      <span class="pn-date mute">{{ fmtDate(nav.newer.created) }}</span>
    </a>
  </nav>
</template>
