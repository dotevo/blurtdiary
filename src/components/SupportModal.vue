<script setup lang="ts">
import { computed } from 'vue';
import ChainDot from './ChainDot.vue';
import { adapter } from '../lib/chains';
import { support, submitSupport } from '../lib/support';
import { setVoteWeight, voteWeight } from '../lib/settings';
import { benLabel } from '../lib/ben';
import { t } from '../lib/i18n';

const checking = computed(() => support.targets.some((x) => x.state === 'checking'));
const needsText = computed(() => support.targets.some((x) => x.state === 'new' || (x.state === 'failed' && !x.existing)));
const todo = computed(() => support.targets.some((x) => ['new', 'existing', 'failed'].includes(x.state)));
const close = (): void => { if (!support.loading) support.show = false; };
const label = (x: (typeof support.targets)[number]): string => {
  if (x.state === 'working') return x.step || t('supporting');
  if (x.state === 'failed') return x.error;
  return { checking: t('supChecking'), new: t('supNew'), existing: t('supExisting'), done: t('supDone'), ok: t('supOk'), working: '', failed: '' }[x.state];
};
</script>
<template>
  <div class="modal" @click.self="close">
    <div class="support">
      <b>{{ t('oldTitle') }}</b>
      <div class="mute">{{ t('oldDesc') }}</div>
      <ul class="sup-list">
        <li v-for="x in support.targets" :key="x.chain" :class="x.state">
          <ChainDot :chain="x.chain" />
          <span class="grow"><b>{{ adapter(x.chain).name }}</b> · <span :class="{ badtxt: x.state === 'failed' }">{{ label(x) }}</span>
            <span v-if="x.bens.length && (x.state === 'new' || x.state === 'failed')" class="mute sup-bens"> · {{ t('oldBens') }}: {{ benLabel(x.bens) }}</span></span>
          <span v-if="x.state === 'checking' || x.state === 'working'" class="spinner" />
        </li>
      </ul>
      <template v-if="needsText">
        <label class="mute">{{ t('oldWrite') }}</label>
        <textarea v-model="support.body" rows="3" :placeholder="t('oldPh')" :disabled="support.loading" />
      </template>
      <label class="mute wrow"><span>{{ t('voteWeight') }}</span><b>{{ voteWeight }}%</b></label>
      <input type="range" min="1" max="100" step="1" :value="voteWeight" :disabled="support.loading" @input="setVoteWeight(+($event.target as HTMLInputElement).value)">
      <div v-if="support.status" class="status" :class="{ err: support.isError }">{{ support.status }}</div>
      <div class="actions">
        <button class="pri" :disabled="support.loading || checking || !todo" @click="submitSupport">{{ needsText ? t('supportBtn') : t('voteBtn') }}</button>
        <button :disabled="support.loading" @click="close">{{ support.targets.every((x) => x.state === 'ok' || x.state === 'done') ? t('close') : t('cancel') }}</button>
      </div>
    </div>
  </div>
</template>
