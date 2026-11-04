<script setup lang="ts">
import { CHAINS } from '../lib/chains';
import { getPref, setPref } from '../lib/chains/nodes';
import { t } from '../lib/i18n';
import ChainDot from './ChainDot.vue';

/** Footer: which RPC node each blockchain talks to. Automatic = queue with fail-over; a pinned node is tried first. */
const host = (u: string): string => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
const RECENT = 5 * 60 * 1000; // a failure counts as "unavailable" for 5 minutes
const down = (c: (typeof CHAINS)[number], u: string): boolean => Date.now() - (c.pool.state.failedAt[u] ?? 0) < RECENT;
const active = (c: (typeof CHAINS)[number]): string => c.pool.state.active;
</script>
<template>
  <details class="nodes">
    <summary>{{ t('rpcNodes') }}</summary>
    <p class="mute help">{{ t('rpcHelp') }}</p>
    <div v-for="c in CHAINS" :key="c.id" class="node-row">
      <ChainDot :chain="c.id" /><b>{{ c.name }}</b>
      <select class="sel" :aria-label="c.name + ' RPC'" :value="getPref(c.id)" @change="setPref(c.id, ($event.target as HTMLSelectElement).value)">
        <option value="">{{ t('rpcAuto') }}</option>
        <option v-for="u in c.pool.nodes" :key="u" :value="u">{{ down(c, u) ? '⚠ ' : '' }}{{ host(u) }}</option>
      </select>
      <span class="mute node-active">{{ active(c) ? t('rpcActive', { n: host(active(c)) }) : t('rpcIdle') }}</span>
    </div>
    <p v-if="getPref('blurt')" class="mute help">{{ t('rpcBlurtNote') }}</p>
  </details>
</template>
