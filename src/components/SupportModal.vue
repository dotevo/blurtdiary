<script setup lang="ts">
import { computed } from 'vue';
import { support, submitSupport } from '../lib/support';
import { setVoteWeight, voteWeight } from '../lib/settings';
import { benLabel } from '../lib/ben';
import { t } from '../lib/i18n';

const existing = computed(() => !!(support.existingAuthor && support.existingPermlink));
const bens = computed(() => support.beneficiaries.length ? support.beneficiaries : [{ account: support.author, weight: 10000 }]);
const close = (): void => { if (!support.loading) support.show = false; };
</script>
<template>
  <div class="modal" @click.self="close">
    <div class="support">
      <b>{{ t('oldTitle') }}</b>
      <div class="mute">{{ existing ? t('oldExisting') : t('oldDesc') }}</div>
      <template v-if="!existing">
        <div class="mute"><b>{{ t('oldBens') }}:</b> {{ benLabel(bens) }}</div>
        <label class="mute">{{ t('oldWrite') }}</label>
        <textarea v-model="support.body" rows="3" :placeholder="t('oldPh')" :disabled="support.loading" />
      </template>
      <label class="mute wrow"><span>{{ t('voteWeight') }}</span><b>{{ voteWeight }}%</b></label>
      <input type="range" min="1" max="100" step="1" :value="voteWeight" :disabled="support.loading" @input="setVoteWeight(+($event.target as HTMLInputElement).value)">
      <div v-if="support.status" class="status" :class="{ err: support.isError }">{{ support.status }}</div>
      <div class="actions">
        <button class="pri" :disabled="support.loading" @click="submitSupport">{{ existing ? t('voteBtn') : t('supportBtn') }}</button>
        <button :disabled="support.loading" @click="close">{{ t('cancel') }}</button>
      </div>
    </div>
  </div>
</template>
