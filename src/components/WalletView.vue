<script setup lang="ts">
import Icon from './Icon.vue';
import ChainDot from './ChainDot.vue';
import { computed, ref, watch } from 'vue';
import { auth, loggedChains } from '../lib/auth';
import { t } from '../lib/i18n';
import { claim, loadHistoryPage, loadWalletPage, powerDown, powerUp, sendTransfer, wallets, wpage, walletUrl } from '../lib/wallet';
import { fmtDate } from '../lib/util';

/** Wallet of every chain you are logged in to: balances, recent operations, transfer, power up / down. Transfers need the ACTIVE key (asked for each time, never kept). */
const chains = computed(() => loggedChains());
const chain = ref(chains.value[0]?.id ?? '');
const mode = ref<'' | 'transfer' | 'up' | 'down'>('');
const to = ref(''); const amount = ref(''); const memo = ref(''); const symbol = ref('');
const w = computed(() => wpage[chain.value]);
const info = computed(() => w.value?.info ?? null);
const num = (v: string): number => parseFloat(v.replace(',', '.'));
const fmt = (n: number, d = 3): string => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const symbols = computed(() => (info.value ? [info.value.liquid.symbol, ...(info.value.dollar ? [info.value.dollar.symbol] : [])] : []));
const maxOf = computed(() => {
  const i = info.value; if (!i) return 0;
  if (mode.value === 'up') return i.liquid.n;
  if (mode.value === 'down') return Math.max(0, i.power.n - i.delegatedOut);
  return symbol.value === i.dollar?.symbol ? i.dollar.n : i.liquid.n;
});
function pick(id: string): void { chain.value = id; mode.value = ''; void open(id); }
async function open(id: string): Promise<void> { if (!wpage[id]?.info) await loadWalletPage(id); if (!wpage[id]?.hist.length) await loadHistoryPage(id); }
function setMode(m: typeof mode.value): void { mode.value = mode.value === m ? '' : m; amount.value = ''; memo.value = ''; to.value = ''; symbol.value = info.value?.liquid.symbol ?? ''; }
async function submit(): Promise<void> {
  const n = num(amount.value); let ok = false;
  if (mode.value === 'transfer') ok = await sendTransfer(chain.value, to.value, n, symbol.value, memo.value);
  else if (mode.value === 'up') ok = await powerUp(chain.value, n);
  else if (mode.value === 'down') ok = await powerDown(chain.value, n);
  if (ok) { mode.value = ''; amount.value = ''; memo.value = ''; to.value = ''; }
}
watch(chains, (l) => { if (!l.some((c) => c.id === chain.value)) chain.value = l[0]?.id ?? ''; });
watch(chain, (id) => { if (id) void open(id); }, { immediate: true });
const KIND_ICON: Record<string, 'up' | 'down' | 'coin' | 'gift' | 'repeat' | 'clock'> = { 'transfer-in': 'down', 'transfer-out': 'up', 'power-up': 'up', 'power-down': 'down', 'power-paid': 'down', claim: 'gift', delegate: 'repeat', savings: 'coin', other: 'clock' };
</script>
<template>
  <div class="wallet">
    <h1><Icon name="coin" /> {{ t('wallet') }}</h1>
    <div v-if="!auth.me" class="mute center">{{ t('walletLogin') }}</div>
    <template v-else>
      <div class="chainbar">
        <button v-for="c in chains" :key="c.id" class="chip" :class="{ on: chain === c.id }" :style="{ '--c': c.color }" @click="pick(c.id)"><ChainDot :chain="c.id" /> {{ c.name }}</button>
      </div>
      <div v-if="w?.error" class="mute badtxt">{{ w.error }}</div>
      <div v-if="w?.loading && !info" class="mute center"><span class="spinner" /> {{ t('loading') }}</div>
      <template v-if="info">
        <div class="wl-acc mute">@{{ auth.sessions[chain].user }} · <a :href="walletUrl(auth.sessions[chain].user, chain)" target="_blank" rel="noopener">{{ t('walletExternal') }}</a></div>
        <div class="wl-bal">
          <div class="card"><span class="mute">{{ t('walletLiquid') }}</span><b>{{ fmt(info.liquid.n) }}</b><span>{{ info.liquid.symbol }}</span></div>
          <div v-if="info.dollar" class="card"><span class="mute">{{ t('walletDollar') }}</span><b>{{ fmt(info.dollar.n) }}</b><span>{{ info.dollar.symbol }}</span></div>
          <div class="card"><span class="mute">{{ t('walletPower') }}</span><b>{{ fmt(info.power.n) }}</b><span>{{ info.power.symbol }}</span>
            <span v-if="info.delegatedOut || info.delegatedIn" class="mute small">{{ info.delegatedIn ? '+' + fmt(info.delegatedIn) : '' }} {{ info.delegatedOut ? '−' + fmt(info.delegatedOut) : '' }}</span></div>
          <div v-if="info.savings" class="card"><span class="mute">{{ t('walletSavings') }}</span><b>{{ fmt(info.savings.n) }}</b><span>{{ info.savings.symbol }}</span></div>
        </div>
        <div v-if="info.withdrawing" class="mute help"><Icon name="clock" /> {{ t('walletPowerDownRunning', { a: fmt(info.withdrawing.weekly) + ' ' + info.power.symbol, d: fmtDate(info.withdrawing.next + 'Z') }) }}</div>
        <div v-if="wallets[chain]?.has" class="wl-reward"><span><Icon name="gift" /> {{ wallets[chain].label }}</span>
          <button class="pri small" :disabled="wallets[chain].busy" @click="claim(chain).then(() => loadWalletPage(chain))">{{ wallets[chain].busy ? '…' : t('claimBtn') }}</button></div>

        <div class="wl-actions">
          <button :class="{ pri: mode === 'transfer' }" @click="setMode('transfer')"><Icon name="up" /> {{ t('walletTransfer') }}</button>
          <button :class="{ pri: mode === 'up' }" @click="setMode('up')"><Icon name="plus" /> {{ t('walletPowerUp') }}</button>
          <button :class="{ pri: mode === 'down' }" @click="setMode('down')"><Icon name="down" /> {{ t('walletPowerDown') }}</button>
        </div>
        <form v-if="mode" class="card wl-form" autocomplete="off" @submit.prevent="submit">
          <template v-if="mode === 'transfer'">
            <input v-model="to" :placeholder="t('walletTo')" autocapitalize="off" spellcheck="false" required>
            <div class="wl-amt"><input v-model="amount" inputmode="decimal" :placeholder="t('walletAmount')" required>
              <select v-if="symbols.length > 1" v-model="symbol"><option v-for="s in symbols" :key="s" :value="s">{{ s }}</option></select><span v-else class="mute">{{ symbols[0] }}</span></div>
            <input v-model="memo" :placeholder="t('walletMemo')" maxlength="2048">
            <div class="mute help">{{ t('walletMemoNote') }}</div>
          </template>
          <template v-else>
            <div class="wl-amt"><input v-model="amount" inputmode="decimal" :placeholder="mode === 'down' ? t('walletAmountDown') : t('walletAmount')" :required="mode === 'up'">
              <span class="mute">{{ mode === 'up' ? info.liquid.symbol : info.power.symbol }}</span></div>
            <div class="mute help">{{ mode === 'up' ? t('walletPowerUpNote') : t('walletPowerDownNote') }}</div>
          </template>
          <button type="button" class="small" @click="amount = String(Math.floor(maxOf * 1000) / 1000)">{{ t('walletMax') }}: {{ fmt(maxOf) }}</button>
          <button class="pri" :disabled="w?.busy">{{ w?.busy ? '…' : t('walletContinue') }}</button>
          <div class="mute help"><Icon name="warn" /> {{ auth.sessions[chain].type === 'wv' ? t('walletVaultNote') : t('walletKeyNote') }}</div>
        </form>

        <h3>{{ t('walletHistory') }}</h3>
        <div v-if="w?.histLoading && !w.hist.length" class="mute center"><span class="spinner" /> {{ t('loading') }}</div>
        <div v-else-if="!w?.hist.length" class="mute">{{ t('walletNoHistory') }}</div>
        <div v-for="h in w?.hist" :key="h.id" class="wl-row" :class="h.kind">
          <Icon :name="KIND_ICON[h.kind]" />
          <span class="grow"><span>{{ h.text }}</span><span v-if="h.memo" class="mute wl-memo"> · {{ h.memo }}</span></span>
          <span class="mute wl-date" :title="h.time">{{ fmtDate(h.time) }}</span>
        </div>
        <div v-if="w?.hist.length && w.moreHist" class="center"><button :disabled="w.histLoading" @click="loadHistoryPage(chain, true)">{{ w.histLoading ? '…' : t('walletOlder') }}</button></div>
      </template>
    </template>
  </div>
</template>
