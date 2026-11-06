<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { CHAINS } from '../lib/chains';
import { loadPending, pendingRows } from '../lib/pending';
import ChainDot from './ChainDot.vue';
import { lang } from '../lib/i18n';
import { coalMap } from '../lib/coal';
import { DEFAULT_PANELS } from '../lib/config';
import { t } from '../lib/i18n';
import { archive, loadOlder, state, commentHref, href, navigate, USER } from '../lib/store';
import { auth } from '../lib/auth';
import { feed, feedHref, loadFeed } from '../lib/feed';
import { favs } from '../lib/favs';
import FavList from './FavList.vue';
import { walletUrl } from '../lib/wallet';
import { excerpt, fmtDate, payoutOf, payoutTitle, renderMd } from '../lib/util';
import UserAvatar from './UserAvatar.vue';

onMounted(() => void loadFeed()); // no-op when logged out or already loaded
const list = computed(() => state.recent.filter((c) => !coalMap.value.has(c.author.toLowerCase())));
const about = computed(() => (state.profile?.about ?? '').replace(/\[\[[^\]]*\]\]/g, ''));
const cats = computed(() => state.cfg.cats.filter((c) => c.name.trim()));
// pending (not yet paid out) rewards of the posts loaded so far
// one row for every chain the blog has an account on (Blurt + the accounts of the `chains:` setting)
const pending = computed(() => {
  const rows = CHAINS.filter((c) => pendingRows[c.id]).map((c) => ({ c, r: pendingRows[c.id] }));
  return { rows, any: rows.some((x) => x.r.n > 0 || x.r.state !== 'ok') };
});
watch(() => [JSON.stringify(state.cfg.accounts ?? {}), auth.me?.user].join('|'), () => void loadPending(), { immediate: true });
// the panels the blog owner chose, in the order they chose
const blogs = computed(() => state.cfg.blogroll ?? []);
const monthLabel = (m: string): string => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)).toLocaleDateString(lang.value, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const panels = computed(() => state.cfg.panels ?? DEFAULT_PANELS);
</script>
<template>
  <aside class="side">
    <!-- visitor-level (not part of the owner's panel settings); on phones the same list is the ★ tab in the category bar -->
    <div v-if="auth.me" class="card feed-card">
      <h4>{{ t('feedTitle') }} <a class="mute feed-all" :href="href({ view: 'feed' })" @click.prevent="navigate(href({ view: 'feed' }))">{{ t('feedAll') }}</a></h4>
      <div v-for="p in feed.posts.slice(0, 10)" :key="p.author + '/' + p.permlink" class="rc">
        <UserAvatar :name="p.author" small />
        <div><b>{{ p.author }}</b> <span class="mute">{{ fmtDate(p.created) }}</span>
          <a :href="feedHref(p)">{{ p.title }}</a></div>
      </div>
      <span v-if="!feed.posts.length" class="mute">{{ feed.loading ? t('loading') : feed.error ? t('chainError', { c: 'Blurt' }) : t('feedEmpty') }}</span>
    </div>
    <div v-if="favs.list.length" class="card fav-card"><h4>★ {{ t('favTitle') }}</h4><FavList /></div>
    <template v-for="(p, i) in panels" :key="i">
      <div v-if="p.id === 'about'" class="card author">
        <UserAvatar :name="USER" />
        <div><b>@{{ USER }}</b>
          <div class="mute links"><a :href="`https://blurt.blog/@${USER}`" target="_blank" rel="noopener">{{ t('profile') }}</a> · <a :href="walletUrl(USER)" target="_blank" rel="noopener">{{ t('wallet') }}</a></div></div>
        <p v-if="state.cfg.about || about" class="mute about">{{ state.cfg.about || about }}</p>
      </div>

      <div v-else-if="p.id === 'payouts' && pending.any" class="card">
        <h4>{{ t('pendingPayouts') }}</h4>
        <div v-for="x in pending.rows" :key="x.c.id" class="pend-row" :title="'@' + x.r.account">
          <ChainDot :chain="x.c.id" /> <span class="pay" :class="{ big: pending.rows.length === 1 }">{{ x.r.state === 'error' ? '–' : x.r.sum.toFixed(3) }} {{ x.c.payoutSymbol }}</span>
          <span class="mute"> · {{ x.r.state === 'loading' && !x.r.n ? t('loading') : x.r.state === 'error' ? t('chainError', { c: x.c.name }) : t('inLatest', { n: x.r.n }) }}</span>
        </div>
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

      <div v-else-if="p.id === 'archive' && archive.length" class="card">
        <h4>{{ t('archive') }}</h4>
        <div class="cat-list arch">
          <a v-for="m in archive" :key="m.key" :class="{ on: state.month === m.key }" :href="href({ month: m.key })" :title="m.partial ? t('archivePartial') : ''" @click.prevent="navigate(href({ month: m.key }))">{{ monthLabel(m.key) }} <span class="mute">({{ m.count }}{{ m.partial ? '+' : '' }})</span></a>
        </div>
        <button v-if="state.more" class="small arch-more" :disabled="state.busy || state.loadingMore" @click="loadOlder">{{ state.busy || state.loadingMore ? t('loading') : t('archiveMore') }}</button>
      </div>

      <div v-else-if="p.id === 'blogroll' && blogs.length" class="card">
        <h4>{{ t('blogroll') }}</h4>
        <a v-for="b in blogs" :key="b.account" class="rc blog-link" :href="`?user=${encodeURIComponent(b.account)}`">
          <UserAvatar :name="b.account" small /><div><b>@{{ b.account }}</b><div v-if="b.desc" class="mute">{{ b.desc }}</div></div>
        </a>
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
