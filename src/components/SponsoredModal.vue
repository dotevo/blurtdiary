<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { t } from '../lib/i18n';
import { refreshCampaigns, SPONSOR_ACCOUNT, sp, type Campaign } from '../lib/sponsored';
import Icon from './Icon.vue';

/** The sponsored tracks of the last 14 days with their BPS (the weight of the lottery) – the "price list" for advertisers. The date field previews another day. */
const emit = defineEmits<{ close: [] }>();
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const today = (): string => iso(Date.now());
const day = ref(today());
const at = computed(() => { const v = Date.parse(`${day.value}T00:00:00Z`); return Number.isNaN(v) ? Date.now() : v; });
type St = 'active' | 'upcoming' | 'expired';
const rows = computed(() => {
  const order: Record<St, number> = { active: 0, upcoming: 1, expired: 2 };
  return sp.list.map((c) => ({ ...c, st: (at.value < c.start ? 'upcoming' : at.value > c.end ? 'expired' : 'active') as St })).sort((a, b) => order[a.st] - order[b.st] || b.bps - a.bps);
});
/** 15 days around today: number of campaigns and the highest BPS of each day. */
const days = computed(() => {
  const base = Date.parse(`${today()}T00:00:00Z`);
  return Array.from({ length: 15 }, (_, k) => {
    const ms = base + (k - 7) * DAY, end = ms + DAY - 1; const act = sp.list.filter((c: Campaign) => c.start <= end && c.end >= ms);
    return { iso: iso(ms), label: iso(ms).slice(5), n: act.length, max: act.length ? Math.max(...act.map((c) => c.bps)) : 0, now: k === 7 };
  });
});
const maxN = computed(() => Math.max(1, ...days.value.map((d) => d.n)));
const maxB = computed(() => Math.max(1e-9, ...days.value.map((d) => d.max)));
onMounted(() => { if (!sp.list.length) void refreshCampaigns(); });
</script>
<template>
  <div class="modal spmodal" @click.self="emit('close')">
    <div class="card spm" role="dialog" :aria-label="t('spTitle')">
      <div class="spm-head"><b><Icon name="coin" /> {{ t('spTitle') }}</b><button class="icon" :title="t('close')" @click="emit('close')"><Icon name="x" /></button></div>
      <div class="spm-p">{{ t('spHow', { a: SPONSOR_ACCOUNT }) }}</div>
      <pre class="spm-memo">{"url":"https://youtu.be/…","sec":30,"start":"{{ today() }}","days":3}</pre>
      <div class="spm-p">{{ t('spHint') }}</div>
      <div class="spm-bar">
        <label>{{ t('spCheckOn') }} <input v-model="day" type="date"></label>
        <button class="small" @click="day = today()">{{ t('spToday') }}</button>
        <button class="small" :disabled="sp.loading" :title="t('refreshing')" @click="refreshCampaigns"><Icon name="refresh" /></button>
      </div>
      <svg class="spm-chart" viewBox="0 0 300 90" role="img" :aria-label="t('spAds')">
        <g v-for="(d, i) in days" :key="d.iso" @click="day = d.iso">
          <rect :x="i * 20 + 2" :y="70 - (d.n / maxN) * 56" width="16" :height="(d.n / maxN) * 56" :class="{ now: d.now, sel: d.iso === day }" class="bar-n"><title>{{ d.iso }}: {{ d.n }} · BPS {{ d.max.toFixed(4) }}</title></rect>
          <text v-if="i % 2 === 0" :x="i * 20 + 10" y="84" text-anchor="middle" font-size="6" class="lbl">{{ d.label }}</text>
        </g>
        <polyline :points="days.map((d, i) => `${i * 20 + 10},${70 - (d.max / maxB) * 56}`).join(' ')" fill="none" stroke="var(--accent)" stroke-width="1.5" />
      </svg>
      <div v-if="!rows.length" class="mute">{{ sp.loading ? t('refreshing') : t('spEmpty') }}</div>
      <table v-else class="spm-table"><thead><tr><th>{{ t('spSponsor') }}</th><th>BPS</th><th>BLURT</th><th>{{ t('spWindow') }}</th><th>{{ t('spStatus') }}</th></tr></thead>
        <tbody><tr v-for="c in rows" :key="c.id" :class="c.st"><td><a :href="`?user=${encodeURIComponent(c.from)}`">@{{ c.from }}</a></td><td>{{ c.bps.toFixed(4) }}</td><td>{{ c.amount }}</td><td>{{ iso(c.start) }} → {{ iso(c.end) }} · {{ c.sec }}s</td><td>{{ t('sp_' + c.st) }}</td></tr></tbody></table>
    </div>
  </div>
</template>
