<script setup lang="ts">
import { computed, ref } from 'vue';
import ChainDot from './ChainDot.vue';
import Icon from './Icon.vue';
import { adapter } from '../lib/chains';
import { clearJobs, jobs, remove, retry, retryAll } from '../lib/queue';
import { t } from '../lib/i18n';

/** Floating button with the queue of per-chain sending jobs: spinner while something is sent, "!" when a job failed (retry from the list), gone when all went through. */
const open = ref(false);
const running = computed(() => jobs.filter((j) => j.status === 'running').length);
const failed = computed(() => jobs.filter((j) => j.status === 'failed').length);
const err = (e?: string): string => (e === 'interrupted' ? t('jobInterrupted') : e ?? '');
const name = (c: string): string => { try { return adapter(c).name; } catch { return c; } };
</script>
<template>
  <div v-if="jobs.length" class="jobq">
    <div v-if="open" class="card jobpop" role="dialog" :aria-label="t('jobTitle')">
      <div class="jp-head"><b>{{ t('jobTitle') }}</b><button class="icon" :title="t('close')" @click="open = false"><Icon name="x" /></button></div>
      <ul>
        <li v-for="j in jobs" :key="j.id" :class="j.status">
          <ChainDot :chain="j.chain" />
          <span class="grow"><span>{{ t('job_' + j.kind) }}<template v-if="j.title">: {{ j.title }}</template> <span class="mute">· {{ name(j.chain) }}</span></span>
          </span>
          <span v-if="j.status === 'running'" class="spinner" :title="t('jobRunning')" />
          <Icon v-else-if="j.status === 'done'" name="check" />
          <span v-else class="jp-btns"><button @click="retry(j.id)"><Icon name="refresh" /> {{ t('jobRetry') }}</button><button class="icon" :title="t('jobDismiss')" @click="remove(j.id)"><Icon name="x" /></button></span>
          <div v-if="j.status === 'failed' && j.error" class="badtxt jp-err">{{ err(j.error) }}</div>
        </li>
      </ul>
      <div v-if="failed" class="jp-foot"><button class="pri" :disabled="!!running" @click="retryAll"><Icon name="refresh" /> {{ t('jobRetryAll') }}</button> <button :disabled="!!running" @click="clearJobs">{{ t('jobClear') }}</button></div>
    </div>
    <button class="jobfab" :class="{ bad: failed && !running }" :title="t('jobTitle')" :aria-label="t('jobTitle')" @click="open = !open">
      <span v-if="running" class="spinner" /><span v-else class="jf-bang">!</span>
    </button>
  </div>
</template>
