<script setup lang="ts">
import { computed } from 'vue';
import { coalMap } from '../lib/coal';
import { DEFAULT_PANELS } from '../lib/config';
import { t } from '../lib/i18n';
import { state, commentHref, href, navigate, USER } from '../lib/store';
import { favs } from '../lib/favs';
import FavList from './FavList.vue';
import { walletUrl } from '../lib/wallet';
import { excerpt, fmtDate, payoutOf, payoutTitle, renderMd } from '../lib/util';
import UserAvatar from './UserAvatar.vue';

const list = computed(() => state.recent.filter((c) => !coalMap.value.has(c.author.toLowerCase())));
const about = computed(() => (state.profile?.about ?? '').replace(/\[\[[^\]]*\]\]/g, ''));
const cats = computed(() => state.cfg.cats.filter((c) => c.name.trim()));
// pending (not yet paid out) rewards of the posts loaded so far
const pending = computed(() => {
  const l = state.posts.filter((p) => p.is_paidout === false);
  return { n: l.length, sum: l.reduce((s, p) => s + payoutOf(p), 0) };
});
// the panels the blog owner chose, in the order they chose
const panels = computed(() => state.cfg.panels ?? DEFAULT_PANELS);
</script>
<template>
  <aside class="side">
    <!-- visitor-level (not part of the owner's panel settings); on phones the same list is the ★ tab in the category bar -->
    <div v-if="favs.list.length" class="card fav-card"><h4>★ {{ t('favTitle') }}</h4><FavList /></div>
    <template v-for="(p, i) in panels" :key="i">
      <div v-if="p.id === 'about'" class="card author">
        <UserAvatar :name="USER" />
        <div><b>@{{ USER }}</b>
          <div class="mute links"><a :href="`https://blurt.blog/@${USER}`" target="_blank" rel="noopener">{{ t('profile') }}</a> · <a :href="walletUrl(USER)" target="_blank" rel="noopener">{{ t('wallet') }}</a></div></div>
        <p v-if="state.cfg.about || about" class="mute about">{{ state.cfg.about || about }}</p>
      </div>

      <div v-else-if="p.id === 'payouts' && pending.n" class="card">
        <h4>{{ t('pendingPayouts') }}</h4>
        <div><span class="pay big">{{ pending.sum.toFixed(3) }} BLURT</span></div>
        <div class="mute">{{ t('inLatest', { n: pending.n }) }}</div>
      </div>

      <div v-else-if="p.id === 'comments'" class="card">
        <h4>{{ t('recentComments') }}</h4>
        <div v-for="c in list" :key="c.author + c.permlink" class="rc">
          <UserAvatar :name="c.author" small />
          <div>
            <b>{{ c.author }}</b> <span class="mute">{{ fmtDate(c.created) }}</span>
            <a v-if="commentHref(c)" :href="commentHref(c)" @click.prevent="navigate(commentHref(c))"><q>{{ excerpt(c.body) }}</q></a>
            <q v-else>{{ excerpt(c.body) }}</q>
            <span class="pay" :title="payoutTitle(c)">{{ payoutOf(c).toFixed(3) }} BLURT</span>
          </div>
        </div>
        <span v-if="!list.length" class="mute">{{ t('noComments') }}</span>
      </div>

      <div v-else-if="p.id === 'categories' && cats.length" class="card">
        <h4>{{ t('secCategories') }}</h4>
        <div class="cat-list"><a v-for="c in cats" :key="c.id" :class="{ on: state.cat === c.id }" :href="href({ cat: c.id })" @click.prevent="navigate(href({ cat: c.id }))">{{ c.name }}</a></div>
      </div>

      <!-- custom panel: title + sanitized single-line Markdown -->
      <div v-else-if="p.id === 'custom'" class="card panel">
        <h4 v-if="p.title">{{ p.title }}</h4>
        <div class="md" v-html="renderMd(p.text ?? '')" />
      </div>
    </template>
  </aside>
</template>
