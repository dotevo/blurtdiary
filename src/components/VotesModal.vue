<script setup lang="ts">
import { computed, ref } from 'vue';
import { CHAINS } from '../lib/chains';
import { t } from '../lib/i18n';
import { num, payoutOf } from '../lib/util';
import type { Post } from '../lib/types';
import ChainDot from './ChainDot.vue';

/**
 * Who voted on one post/comment, per chain: vote weight (%), share of the item's total vote strength (rshares) and the part of the
 * payout that share stands for. The payout part is an ESTIMATE (the real split between author and curators is made by the chain).
 * Voter names are only ever rendered as text.
 */
const props = defineProps<{ versions: Record<string, Post> }>();
const emit = defineEmits<{ close: [] }>();
const MAX_ROWS = 60;
const list = computed(() => CHAINS.filter((c) => props.versions[c.id]));
const cur = ref(list.value[0]?.id ?? '');
const post = computed(() => props.versions[cur.value]);
const sym = computed(() => CHAINS.find((c) => c.id === cur.value)?.payoutSymbol ?? '');
const rows = computed(() => {
  const p = post.value; if (!p) return { items: [], more: 0, known: false };
  const votes = (p.active_votes ?? []).map((v) => ({ voter: String(v.voter), pct: !v.percent ? null : num(v.percent) / 100 /* 0 = not reported (Melek sends 0) */, rs: v.rshares == null ? null : num(v.rshares) }));
  const known = votes.length > 0 && votes.every((v) => v.rs != null);
  const total = known ? votes.reduce((s, v) => s + (v.rs as number), 0) : 0;
  const pay = payoutOf(p);
  const items = votes.map((v) => {
    const share = known && total > 0 ? ((v.rs as number) / total) * 100 : null;
    return { ...v, share, reward: share != null ? (pay * share) / 100 : null };
  }).sort((a, b) => (b.rs ?? 0) - (a.rs ?? 0));
  return { items: items.slice(0, MAX_ROWS), more: Math.max(0, items.length - MAX_ROWS), known };
});
const bens = computed(() => {
  const list = (post.value?.beneficiaries ?? []).map((b) => ({ account: String(b.account), pct: num(b.weight) / 100 })).filter((b) => b.pct > 0);
  const rest = Math.max(0, 100 - list.reduce((s, b) => s + b.pct, 0));
  return { list, rest };
});
const f = (n: number | null, d: number, suffix = ''): string => (n == null ? '–' : n.toFixed(d) + suffix);
</script>
<template>
  <div class="modal vmodal" @click.self="emit('close')">
    <div>
      <b>{{ t('votesTitle') }}</b>
      <div class="tabs">
        <button v-for="c in list" :key="c.id" :class="{ pri: cur === c.id }" @click="cur = c.id"><ChainDot :chain="c.id" /> {{ c.name }} ({{ versions[c.id].active_votes?.length ?? 0 }})</button>
      </div>
      <div v-if="!rows.items.length" class="mute">{{ t('votesNone') }}</div>
      <div v-else class="votes-wrap">
        <table class="votes">
          <thead><tr><th>{{ t('votesVoter') }}</th><th :title="t('votesPctHelp')">{{ t('votesPct') }}</th><th :title="t('votesShareHelp')">{{ t('votesShare') }}</th><th :title="t('votesNote')">≈ {{ sym }}</th></tr></thead>
          <tbody>
            <tr v-for="v in rows.items" :key="v.voter">
              <td>@{{ v.voter }}</td><td>{{ f(v.pct, 0, '%') }}</td><td>{{ f(v.share, 1, '%') }}</td><td>{{ f(v.reward, 3) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="rows.more" class="mute">{{ t('votesMore', { n: rows.more }) }}</div>
      </div>
      <div class="bens">
        <b>{{ t('benTitle') }}</b>
        <div v-if="!bens.list.length" class="mute">{{ t('benNone') }}</div>
        <table v-else class="votes">
          <tbody>
            <tr><td>@{{ post?.author }} ({{ t('benAuthor') }})</td><td>{{ bens.rest.toFixed(2).replace(/\.?0+$/, '') }}%</td></tr>
            <tr v-for="b in bens.list" :key="b.account"><td>@{{ b.account }}</td><td>{{ b.pct.toFixed(2).replace(/\.?0+$/, '') }}%</td></tr>
          </tbody>
        </table>
      </div>
      <div class="mute help">{{ rows.known ? t('votesNote') : t('votesNoStrength') }}</div>
      <button @click="emit('close')">{{ t('close') }}</button>
    </div>
  </div>
</template>
