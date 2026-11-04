<script setup lang="ts">
import { feed, loadFeed, reloadFeed } from '../lib/feed';
import { auth, loginOpen } from '../lib/auth';
import { t } from '../lib/i18n';
import { onMounted } from 'vue';
import PostCard from './PostCard.vue';
onMounted(() => void loadFeed());
</script>
<template>
  <section>
    <h2 class="feed-h">{{ t('feedTitle') }} <button v-if="auth.me" class="small" :disabled="feed.loading" @click="reloadFeed">↻</button></h2>
    <div v-if="!auth.me" class="center"><p class="mute">{{ t('feedLogin') }}</p><button class="pri" @click="loginOpen = true">{{ t('login') }}</button></div>
    <template v-else>
      <div v-if="feed.posts.length" class="grid"><PostCard v-for="p in feed.posts" :key="p.author + '/' + p.permlink" :post="p" /></div>
      <div v-else-if="feed.loading" class="mute center">{{ t('loading') }}</div>
      <div v-else-if="feed.error" class="center err"><p>{{ feed.error }}</p><button @click="reloadFeed">{{ t('retry') }}</button></div>
      <div v-else class="mute center">{{ t('feedEmpty') }}</div>
      <div v-if="feed.posts.length && feed.more" class="center"><button :disabled="feed.loading" @click="loadFeed(true)">{{ feed.loading ? t('loading') : t('loadMore') }}</button></div>
    </template>
  </section>
</template>
