<script setup lang="ts">
import { computed, ref } from 'vue';
import { CHAINS } from '../lib/chains';
import { t } from '../lib/i18n';
import { fmtDate, renderMd } from '../lib/util';
import type { Post } from '../lib/types';
import ChainDot from './ChainDot.vue';

/** Shows the copies of one post/comment side by side (as tabs) when they differ between chains. */
const props = defineProps<{ versions: Record<string, Post> }>();
const emit = defineEmits<{ close: [] }>();
const list = computed(() => CHAINS.filter((c) => props.versions[c.id]));
const cur = ref(list.value[0]?.id ?? '');
const v = computed(() => props.versions[cur.value]);
</script>
<template>
  <div class="modal vmodal" @click.self="emit('close')">
    <div>
      <b>{{ t('versionsTitle') }}</b>
      <div class="mute">{{ t('versionsHelp') }}</div>
      <div class="tabs">
        <button v-for="c in list" :key="c.id" :class="{ pri: cur === c.id }" @click="cur = c.id"><ChainDot :chain="c.id" /> {{ c.name }}</button>
      </div>
      <div v-if="v" class="mute">@{{ v.author }} · {{ fmtDate(v.created) }}</div>
      <h3 v-if="v?.title">{{ v.title }}</h3>
      <div v-if="v" class="md vbody" v-html="renderMd(v.body)" />
      <button @click="emit('close')">{{ t('close') }}</button>
    </div>
  </div>
</template>
