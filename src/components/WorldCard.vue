<script setup lang="ts">
import { computed } from 'vue';
import { adapter } from '../lib/chains';
import { t } from '../lib/i18n';
import { href, navigate, openTag, tagHref, USER } from '../lib/store';
import type { WItem } from '../lib/world';
import { excerpt, fmtDate, payoutOf, payoutTitle, tagsOf, thumbOf, votesOf } from '../lib/util';
import ChainDot from './ChainDot.vue';

/** A post of the world listings: on how many chains it exists is shown with the chain dots; a post that is not on Blurt opens in the in-app reader of ITS chain. */
const props = defineProps<{ item: WItem }>();
const p = computed(() => props.item.lead);
const chain = computed(() => props.item.chains[0]);
const onBlurt = computed(() => !!props.item.copies.blurt);
const link = computed(() => {
  const x = p.value;
  if (onBlurt.value) return x.author === USER ? href({ post: x.permlink }) : `?user=${encodeURIComponent(x.author)}&post=${encodeURIComponent(x.permlink)}`;
  return href({ post: `${x.author}/${x.permlink}`, chain: chain.value });
});
const go = (e: Event): void => { if (!onBlurt.value || p.value.author === USER) { e.preventDefault(); navigate(link.value); } };
const sym = computed(() => adapter(chain.value).payoutSymbol);
const tags = computed(() => tagsOf(p.value).slice(0, 4));
const img = computed(() => thumbOf(p.value));
const hue = computed(() => [...p.value.title].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 360);
</script>
<template>
  <article class="card hoverable wcard">
    <a v-if="img" class="thumb" :href="link" :style="{ backgroundImage: `url('${img}')` }" :aria-label="p.title" @click="go" />
    <a v-else class="thumb ph" :href="link" :style="{ '--h': hue }" @click="go">{{ (p.title[0] || '•').toUpperCase() }}</a>
    <div class="card-b">
      <div class="mute feed-by wc-by">
        <span class="mchains"><ChainDot v-for="c in item.chains" :key="c" :chain="c" :title="t('fromChain', { c: adapter(c).name })" /></span>
        @{{ p.author }}
      </div>
      <h3><a :href="link" @click="go">{{ p.title }}</a></h3>
      <p>{{ excerpt(p.body) }}</p>
      <div v-if="tags.length" class="wc-tags"><a v-for="tag in tags" :key="tag" class="tag" :href="tagHref(tag)" @click.prevent="openTag(tag)">#{{ tag }}</a></div>
      <div class="meta">
        <span>{{ fmtDate(p.created) }}</span>
        <span class="pay" :title="payoutTitle(p)">{{ payoutOf(p).toFixed(3) }} {{ sym }}</span>
        <span>♥ {{ votesOf(p) }}</span><span>💬 {{ p.children ?? 0 }}</span>
      </div>
    </div>
  </article>
</template>
