<script setup lang="ts">
/** Stacked bar chart (author / curation / benefactor rewards per day, week or month). Plain SVG, no library. */
import { computed } from 'vue';
import { t } from '../lib/i18n';
import type { StatPoint } from '../lib/chains/types';
const props = defineProps<{ points: StatPoint[]; unit: string; days: number }>();

interface Bar { label: string; author: number; curation: number; benefactor: number; total: number }
/** ≤45 days: one bar per day · ≤120: per 7 days · longer: per calendar month */
const bars = computed<Bar[]>(() => {
  const pts = props.points.slice(-props.days - 1);
  const keyOf = (p: StatPoint, i: number): string => (props.days <= 45 ? p.day : props.days <= 120 ? pts[Math.floor(i / 7) * 7].day : p.day.slice(0, 7));
  const map = new Map<string, Bar>();
  pts.forEach((p, i) => {
    const k = keyOf(p, i); const b = map.get(k) ?? { label: k, author: 0, curation: 0, benefactor: 0, total: 0 }; map.set(k, b);
    b.author += p.author; b.curation += p.curation; b.benefactor += p.benefactor; b.total += p.author + p.curation + p.benefactor;
  });
  return [...map.values()];
});
/** "nice" upper bound for the y axis: 1, 2, 2.5, 5 × 10^n */
const top = computed(() => {
  const m = Math.max(...bars.value.map((b) => b.total), 0); if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m))); const r = m / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
});
const W = 640, H = 220, L = 46, B = 26, T = 10, R = 6;
const bw = computed(() => (W - L - R) / Math.max(bars.value.length, 1));
const y = (v: number): number => T + (H - T - B) * (1 - v / top.value);
const ticks = computed(() => [0, 1, 2, 3, 4].map((i) => (top.value * i) / 4));
const fmt = (v: number): string => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const labelEvery = computed(() => Math.max(1, Math.ceil(bars.value.length / 6)));
const short = (l: string): string => (l.length === 10 ? l.slice(5) : l);
const tip = (b: Bar): string => `${b.label}\n${t('statsAuthor')}: ${b.author.toFixed(3)}\n${t('statsCuration')}: ${b.curation.toFixed(3)}\n${t('statsBenefactor')}: ${b.benefactor.toFixed(3)}\n= ${b.total.toFixed(3)} ${props.unit}`;
</script>
<template>
  <svg class="ec" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`${t('statsTitle')} ${unit}`" preserveAspectRatio="xMidYMid meet">
    <g class="ec-grid">
      <template v-for="v in ticks" :key="v"><line :x1="L" :x2="W - R" :y1="y(v)" :y2="y(v)" /><text :x="L - 6" :y="y(v) + 3.5" text-anchor="end">{{ fmt(v) }}</text></template>
    </g>
    <g v-for="(b, i) in bars" :key="b.label">
      <title>{{ tip(b) }}</title>
      <rect :x="L + i * bw" :y="T" :width="bw" :height="H - T - B" class="ec-hit" />
      <rect class="s-author" :x="L + i * bw + bw * 0.15" :width="bw * 0.7" :y="y(b.author)" :height="y(0) - y(b.author)" />
      <rect class="s-curation" :x="L + i * bw + bw * 0.15" :width="bw * 0.7" :y="y(b.author + b.curation)" :height="y(b.author) - y(b.author + b.curation)" />
      <rect class="s-benef" :x="L + i * bw + bw * 0.15" :width="bw * 0.7" :y="y(b.total)" :height="y(b.author + b.curation) - y(b.total)" />
      <text v-if="i % labelEvery === 0" class="ec-x" :x="L + i * bw + bw / 2" :y="H - 8" text-anchor="middle">{{ short(b.label) }}</text>
    </g>
  </svg>
</template>
