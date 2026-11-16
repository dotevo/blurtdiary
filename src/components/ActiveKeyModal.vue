<script setup lang="ts">
import Icon from './Icon.vue';
import { ref, watch } from 'vue';
import { activeAsk, answerActiveKey } from '../lib/activeKey';
import { adapter } from '../lib/chains';
import { t } from '../lib/i18n';
import ChainDot from './ChainDot.vue';

/** One-time prompt for the ACTIVE key. The typed key lives only in this input until it is handed to the signature; it is cleared right away. */
const key = ref('');
const input = ref<HTMLInputElement | null>(null);
watch(() => activeAsk.open, (o) => { key.value = ''; if (o) setTimeout(() => input.value?.focus(), 50); });
function ok(): void { const k = key.value.trim(); key.value = ''; if (k) answerActiveKey(k); }
function cancel(): void { key.value = ''; answerActiveKey(null); }
</script>
<template>
  <div v-if="activeAsk.open" class="modal" @click.self="cancel" @keydown.esc="cancel">
    <form autocomplete="off" @submit.prevent="ok">
      <b><Icon name="lock" /> {{ t('activeKeyTitle') }}</b>
      <div class="ak-sum"><ChainDot :chain="activeAsk.chain" /> <b>@{{ activeAsk.account }}</b> · {{ adapter(activeAsk.chain).name }}<br>{{ activeAsk.summary }}</div>
      <div class="ak-warn"><Icon name="warn" /> {{ t('activeKeyWarn') }}</div>
      <input ref="input" v-model="key" type="password" name="bd-active-key" autocomplete="off" autocapitalize="off" spellcheck="false" :placeholder="t('activeKeyPh')">
      <span class="mute help">{{ t('activeKeyNote') }}</span>
      <button class="pri" type="submit" :disabled="!key.trim()">{{ t('activeKeySign') }}</button>
      <button type="button" @click="cancel">{{ t('cancel') }}</button>
    </form>
  </div>
</template>
