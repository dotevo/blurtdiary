<script setup lang="ts">
import { computed } from 'vue';
import type { Post } from '../lib/types';
import { excerpt, fmtDate, payoutOf, payoutTitle, thumbOf, votesOf } from '../lib/util';
import { href, navigate } from '../lib/store';
const props = defineProps<{ post: Post }>();
const link = computed(() => href({ post: props.post.permlink }));
const img = computed(() => thumbOf(props.post));
const hue = computed(() => [...props.post.title].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 360); // stable colour per post
</script>
<template>
  <article class="card hoverable">
    <a v-if="img" class="thumb" :href="link" :style="{ backgroundImage: `url('${img}')` }" :aria-label="post.title" @click.prevent="navigate(link)" />
    <a v-else class="thumb ph" :href="link" :style="{ '--h': hue }" @click.prevent="navigate(link)">{{ (post.title[0] || '•').toUpperCase() }}</a>
    <div class="card-b">
      <h3><a :href="link" @click.prevent="navigate(link)">{{ post.title }}</a></h3>
      <p>{{ excerpt(post.body) }}</p>
      <div class="meta">
        <span>{{ fmtDate(post.created) }}</span>
        <span class="pay" :title="payoutTitle(post)">{{ payoutOf(post).toFixed(3) }} BLURT</span>
        <span>♥ {{ votesOf(post) }}</span><span>💬 {{ post.children ?? 0 }}</span>
      </div>
    </div>
  </article>
</template>
