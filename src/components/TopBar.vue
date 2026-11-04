<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { auth, loggedChains, loginOpen, setSession } from '../lib/auth';
import type { ChainId } from '../lib/chains';
import { t } from '../lib/i18n';
import { setVoteWeight, voteWeight } from '../lib/settings';
import { href, navigate, state, USER } from '../lib/store';
import { adapter } from '../lib/chains';
import { closeNotifs, loadNotifs, notifHref, notifIcon, notifs, toggleNotifs, unread } from '../lib/notifs';
import { CHAINS } from '../lib/chains';
import { claim, loadWallets, wallets, walletUrl } from '../lib/wallet';
import { fmtDate } from '../lib/util';
import LangSelect from './LangSelect.vue';
import ChainDot from './ChainDot.vue';
import UserAvatar from './UserAvatar.vue';

watch(() => auth.me?.user, (u) => { if (u) void loadNotifs(); }, { immediate: true });
// voting power and pending rewards of every logged-in chain (reloaded when a chain is added or removed, and every 2 minutes)
watch(() => Object.values(auth.sessions).map((s) => s.chain + s.user).join(), () => { void loadWallets(); }, { immediate: true });
setInterval(() => { void loadWallets(); }, 120000);
const vpText = (id: string): string => { const v = wallets[id]?.vp; return v == null ? '' : `${v.toFixed(v < 10 ? 1 : 0)}%`; };
const isOwner = computed(() => auth.me?.user === USER);
/** Own blog: another blog has another config, so this is a normal page load (like following a notification to someone else's blog). */
const myBlog = computed(() => (auth.me ? `?user=${encodeURIComponent(auth.me.user)}` : ''));
const menuOpen = ref(false);
const closeAll = (): void => { closeNotifs(); menuOpen.value = false; };
const go = (h: string): void => { closeAll(); if (h) navigate(h); };
const bell = (): void => { menuOpen.value = false; toggleNotifs(); };
const toggleMenu = (): void => { closeNotifs(); menuOpen.value = !menuOpen.value; };
const logout = (chain: ChainId): void => { closeAll(); setSession(chain, null); };
const loggedIn = computed(() => Object.keys(auth.sessions).length > 0);
const shownUser = computed(() => auth.me?.user ?? Object.values(auth.sessions)[0]?.user ?? '');
const addAccount = (): void => { closeAll(); loginOpen.value = true; };
</script>
<template>
  <header class="topbar"><div class="topbar-in">
    <LangSelect compact />
    <span class="grow" />
    <div v-if="loggedIn" class="user-area">
      <template v-for="c in loggedChains()" :key="c.id">
        <button v-if="wallets[c.id]?.has" class="pri claim" :disabled="wallets[c.id].busy" :title="t('claimTitle', { list: wallets[c.id].label })" @click="claim(c.id)">🎁 <ChainDot :chain="c.id" /><span class="nb-lbl"> {{ wallets[c.id].power }} {{ c.powerSymbol }}</span></button>
      </template>
      <span v-for="c in loggedChains()" :key="'vp' + c.id" class="vp nb-lbl" :title="t('vpTitle', { c: c.name })"><ChainDot :chain="c.id" /> {{ vpText(c.id) || '–' }}</span>
      <button v-if="auth.me" class="icon" :aria-label="t('notifications')" @click="bell">🔔<span v-if="unread" class="badge">{{ unread > 9 ? '9+' : unread }}</span></button>
      <a v-if="auth.me && !isOwner" class="btn" :href="myBlog" :title="t('myBlog')" :aria-label="t('myBlog')">🏠 <span class="nb-lbl">{{ t('myBlog') }}</span></a>
      <template v-if="isOwner">
        <a class="btn" :class="{ on: state.view === 'write' }" :href="href({ view: 'write' })" :title="t('write')" :aria-label="t('write')" @click.prevent="go(href({ view: 'write' }))">✍ <span class="nb-lbl">{{ t('write') }}</span></a>
        <a class="btn" :class="{ on: state.view === 'settings' }" :href="href({ view: 'settings' })" :title="t('settings')" :aria-label="t('settings')" @click.prevent="go(href({ view: 'settings' }))">⚙</a>
      </template>
      <button class="acc" :aria-label="t('account')" :title="t('account')" @click="toggleMenu"><UserAvatar :name="shownUser" small /><span class="who">@{{ shownUser }}</span> ▾</button>
    </div>
    <button v-else class="pri" @click="loginOpen = true">{{ t('login') }}</button>

    <!-- dropdowns: fixed under the bar, always fully visible and scrollable -->
    <template v-if="notifs.open || menuOpen">
      <div class="backdrop" @click="closeAll" />
      <div v-if="notifs.open" class="panel notif-panel">
        <div class="np-head"><b>{{ t('notifications') }}</b><span v-if="notifs.loading" class="mute"><span class="spinner" /> {{ t('refreshing') }}</span></div>
        <div v-if="!notifs.items.length && !notifs.loading" class="mute np-empty">{{ t('noNotifs') }}</div>
        <component :is="notifHref(n) ? 'a' : 'div'" v-for="n in notifs.items" :key="n.id" class="np-item" :class="{ unread: n.id > notifs.lastRead }"
          :style="{ '--c': adapter(n.chain).color }" :href="notifHref(n) || undefined" @click.prevent="go(notifHref(n))">
          <span class="np-ico"><ChainDot :chain="n.chain" /></span>
          <span class="np-body"><span class="np-msg">{{ notifIcon(n.type) }} {{ n.msg }}</span><br><span class="mute">{{ adapter(n.chain).name }} · {{ fmtDate(n.date) }}</span></span>
        </component>
      </div>
      <div v-else class="panel menu-panel">
        <a v-if="auth.me" class="mp-row" :href="myBlog" @click="isOwner && ($event.preventDefault(), go(href({})))">🏠 {{ t('myBlog') }} <span class="mute">@{{ auth.me.user }}</span></a>
        <div v-for="c in loggedChains()" :key="c.id" class="mp-chain">
          <ChainDot :chain="c.id" /><span class="grow"><b>@{{ auth.sessions[c.id].user }}</b>
            <span class="mute"> · {{ t('vp') }} {{ vpText(c.id) || '–' }}</span></span>
          <a class="mute" :href="walletUrl(auth.sessions[c.id].user, c.id)" target="_blank" rel="noopener">{{ t('wallet') }}</a>
          <button class="small" @click="logout(c.id)">{{ t('logout') }}</button>
        </div>
        <div v-if="auth.me && loggedChains().length > 1" class="mute mp-note">{{ t('logoutBlurtAll') }}</div>
        <button v-if="loggedChains().length < CHAINS.length" class="mp-row" @click="addAccount">＋ {{ t('addAccount') }}</button>
        <label v-if="auth.me" class="mp-row"><span>♥ {{ t('voteWeight') }}</span>
          <select class="sel" :value="voteWeight" @change="setVoteWeight(+($event.target as HTMLSelectElement).value)"><option v-for="w in [100, 75, 50, 25, 10]" :key="w" :value="w">{{ w }}%</option></select></label>
      </div>
    </template>
  </div></header>
</template>
