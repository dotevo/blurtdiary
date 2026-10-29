<script setup lang="ts">
import { APP_DEV } from '../lib/ben';
import { t } from '../lib/i18n';
import { devTip, setDevTip } from '../lib/settings';
defineProps<{ list?: string }>();
</script>
<template>
  <div class="devtip">
    <label><input type="checkbox" :checked="devTip" @change="setDevTip(($event.target as HTMLInputElement).checked)"> {{ t('devTip', { dev: APP_DEV }) }}</label>
    <div v-if="list" class="mute ben">{{ t('benNotice', { list }) }}</div>
  </div>
</template>
