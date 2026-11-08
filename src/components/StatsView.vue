<script setup lang="ts">
import Icon from './Icon.vue';
import { onMounted } from 'vue';
import { t } from '../lib/i18n';
import { RANGES, loadStats, retryChain, setRange, statsChains, statsState } from '../lib/stats';
import { USER } from '../lib/store';
import ChainDot from './ChainDot.vue';
import EarningsChart from './EarningsChart.vue';
onMounted(() => void loadStats());
const sum = (s: { author: number; curation: number; benefactor: number }): number => s.author + s.curation + s.benefactor;
</script>
<template>
  <section class="stats">
    <h2 class="feed-h"><Icon name="chart" /> {{ t('statsTitle') }} <span class="mute">@{{ USER }}</span></h2>
    <div class="tabs"><button v-for="d in RANGES" :key="d" class="chip" :class="{ on: statsState.days === d }" @click="setRange(d)">{{ t('statsDays', { n: d }) }}</button></div>
    <div v-for="c in statsChains()" :key="c.id" class="card stat-card" :style="{ '--c': c.color }">
      <div class="stat-h"><ChainDot :chain="c.id" /><b>{{ c.name }}</b><span class="mute">@{{ statsState.chains[c.id]?.account }}</span></div>
      <div v-if="!statsState.chains[c.id] || statsState.chains[c.id].status === 'loading'" class="mute"><span class="spinner" /> {{ t('loading') }}
        <span v-if="statsState.chains[c.id]?.progress">· {{ t('statsScanned', { n: statsState.chains[c.id].progress!.scanned, d: statsState.chains[c.id].progress!.reached }) }}</span></div>
      <div v-else-if="statsState.chains[c.id].status === 'error'" class="err"><p>{{ statsState.chains[c.id].error }}</p><button class="small" @click="retryChain(c.id)">{{ t('retry') }}</button></div>
      <template v-else-if="statsState.chains[c.id].data">
        <template v-for="d in [statsState.chains[c.id].data!]" :key="d.chain">
          <div class="stat-tot"><span class="big">{{ sum(d.totals).toFixed(3) }} {{ d.unit }}</span>
            <span v-if="d.debtUnit && d.totals.debt > 0" class="mute"> + {{ d.totals.debt.toFixed(3) }} {{ d.debtUnit }}</span></div>
          <div class="legend"><span><i class="lsw s-author" />{{ t('statsAuthor') }} {{ d.totals.author.toFixed(3) }}</span><span><i class="lsw s-curation" />{{ t('statsCuration') }} {{ d.totals.curation.toFixed(3) }}</span><span><i class="lsw s-benef" />{{ t('statsBenefactor') }} {{ d.totals.benefactor.toFixed(3) }}</span></div>
          <div v-if="sum(d.totals) <= 0 && d.totals.debt <= 0" class="mute">{{ t('statsEmpty') }}</div>
          <EarningsChart :points="d.points" :unit="d.unit" :days="statsState.days" />
          <div class="mute stat-note">
            <span v-if="d.from">{{ t('statsScanned', { n: d.scanned, d: d.from }) }}</span>
            <span v-if="!d.complete"> · <Icon name="warn" /> {{ t('statsPartial', { d: d.from ?? '?' }) }}</span>
            <span v-if="d.vestsConverted"> · {{ t('statsVests') }}</span>
          </div>
        </template>
      </template>
    </div>
    <p v-if="!statsChains().length" class="mute">{{ t('noPosts') }}</p>
  </section>
</template>
