<script setup lang="ts">
import { computed } from 'vue';
import type { Post } from '../lib/types';
import { excerpt, fmtDate, payoutOf, payoutTitle, thumbOf, votesOf } from '../lib/util';
import { href, navigate, USER } from '../lib/store';
import { feedHref } from '../lib/feed';
const props = defineProps<{ post: Post }>();
const foreign = computed(() => props.post.author !== USER); // feed card of someone else: open it in that author's blog
const link = computed(() => (foreign.value ? feedHref(props.post) : href({ post: props.post.permlink })));
const go = (e: Event): void => { if (!foreign.value) { e.preventDefault(); navigate(link.value); } };
const img = computed(() => thumbOf(props.post));
const hue = computed(() => [...props.post.title].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 360); // stable colour per post
</script>
<template>
  <article class="card hoverable">
    <a v-if="img" class="thumb" :href="link" :style="{ backgroundImage: `url('${img}')` }" :aria-label="post.title" @click="go" />
    <a v-else class="thumb ph" :href="link" :style="{ '--h': hue }" @click="go">{{ (post.title[0] || '•').toUpperCase() }}</a>
    <div class="card-b">
      <div v-if="foreign" class="mute feed-by">@{{ post.author }}</div>
      <h3><a :href="link" @click="go">{{ post.title }}</a></h3>
      <p>{{ excerpt(post.body) }}</p>
      <div class="meta">
        <span>{{ fmtDate(post.created) }}</span>
        <span class="pay" :title="payoutTitle(post)">{{ payoutOf(post).toFixed(3) }} BLURT</span>
        <span>♥ {{ votesOf(post) }}</span><span>💬 {{ post.children ?? 0 }}</span>
      </div>
    </div>
  </article>
</template>
