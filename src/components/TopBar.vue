<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { auth, loggedChains, loginOpen, setSession } from '../lib/auth';
import type { ChainId } from '../lib/chains';
import { t } from '../lib/i18n';
import { setVoteWeight, voteWeight } from '../lib/settings';
import { href, navigate, state, USER } from '../lib/store';
import { adapter } from '../lib/chains';
import { closeNotifs, loadNotifs, notifGroups, notifIcon, notifLink, notifs, toggleNotifs, unread } from '../lib/notifs';
import { CHAINS } from '../lib/chains';
import { claim, loadWallets, wallets, walletUrl } from '../lib/wallet';
import { fmtAgo, fmtDate } from '../lib/util';
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
const openNotif = (n: Parameters<typeof notifLink>[0]): void => {
  const l = notifLink(n);
  if (l.ext) { closeAll(); window.open(l.href, '_blank', 'noopener'); } else go(l.href);
};
/** Chains with unclaimed rewards. Phones get one 🎁 chip with this count (the amounts are in the account menu), desktops one button per chain. */
const rewardChains = computed(() => loggedChains().filter((c) => wallets[c.id]?.has));
const rewardTitle = computed(() => rewardChains.value.map((c) => `${c.name}: ${wallets[c.id].label}`).join('\n'));
const openRewards = (): void => { closeNotifs(); menuOpen.value = true; };
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
        <button v-if="wallets[c.id]?.has" class="pri claim claim-d" :disabled="wallets[c.id].busy" :title="t('claimTitle', { list: wallets[c.id].label })" @click="claim(c.id)">🎁 <ChainDot :chain="c.id" /><span class="nb-lbl"> {{ wallets[c.id].power }} {{ c.powerSymbol }}</span></button>
      </template>
      <button v-if="rewardChains.length" class="pri claim claim-m" :title="rewardTitle" :aria-label="t('rewardsPending')" @click="openRewards">🎁<span class="badge badge-n">{{ rewardChains.length }}</span></button>
      <span v-for="c in loggedChains()" :key="'vp' + c.id" class="vp nb-lbl" :title="t('vpTitle', { c: c.name })"><ChainDot :chain="c.id" /> {{ vpText(c.id) || '–' }}</span>
      <button v-if="auth.me" class="icon" :aria-label="t('notifications')" @click="bell">🔔<span v-if="unread" class="badge">{{ unread > 9 ? '9+' : unread }}</span></button>
      <a class="btn navbtn" :class="{ on: state.view === 'feed' || (state.view === 'world' && state.tab !== 'tags' && !state.tag) }" :href="href({ view: 'world', tab: 'feed' })" :title="t('feedTitle')" :aria-label="t('feedTitle')" @click.prevent="go(href({ view: 'world', tab: 'feed' }))">📰 <span class="nb-lbl">{{ t('feedTitle') }}</span></a>
      <a class="btn navbtn" :class="{ on: state.view === 'world' && (state.tab === 'tags' || !!state.tag) }" :href="href({ view: 'world', tab: 'tags' })" :title="t('tagsTab')" :aria-label="t('tagsTab')" @click.prevent="go(href({ view: 'world', tab: 'tags' }))"># <span class="nb-lbl">{{ t('tagsTab') }}</span></a>
      <a v-if="auth.me && !isOwner" class="btn navbtn" :href="myBlog" :title="t('myBlog')" :aria-label="t('myBlog')">🏠 <span class="nb-lbl">{{ t('myBlog') }}</span></a>
      <template v-if="isOwner">
        <a class="btn navbtn" :class="{ on: state.view === 'write' }" :href="href({ view: 'write' })" :title="t('write')" :aria-label="t('write')" @click.prevent="go(href({ view: 'write' }))">✍ <span class="nb-lbl">{{ t('write') }}</span></a>
        <a class="btn navbtn" :class="{ on: state.view === 'settings' }" :href="href({ view: 'settings' })" :title="t('settings')" :aria-label="t('settings')" @click.prevent="go(href({ view: 'settings' }))">⚙</a>
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
        <component :is="notifLink(g.lead).href ? 'a' : 'div'" v-for="g in notifGroups" :key="g.items.map((i) => i.chain + (i.src ?? '') + i.id).join()" class="np-item" :class="{ unread: g.unread }"
          :style="{ '--c': adapter(g.lead.chain).color }" :href="notifLink(g.lead).href || undefined" @click.prevent="openNotif(g.lead)">
          <span class="np-ico"><ChainDot v-for="c in g.chains" :key="c" :chain="c" /></span>
          <span class="np-body"><span class="np-msg">{{ notifIcon(g.lead.type) }} {{ g.lead.msg }}</span><br><span class="mute">{{ g.chains.map((c) => adapter(c).name).join(' + ') }} · <span :title="fmtDate(g.lead.date)">{{ fmtAgo(g.lead.date) }}</span></span></span>
        </component>
      </div>
      <div v-else class="panel menu-panel">
        <a v-if="auth.me" class="mp-row" :href="myBlog" @click="isOwner && ($event.preventDefault(), go(href({})))">🏠 {{ t('myBlog') }} <span class="mute">@{{ auth.me.user }}</span></a>
        <div v-for="c in loggedChains()" :key="c.id" class="mp-chain">
          <ChainDot :chain="c.id" /><span class="grow"><b>@{{ auth.sessions[c.id].user }}</b>
            <span class="mute"> · {{ t('vp') }} {{ vpText(c.id) || '–' }}</span></span>
          <a class="mute" :href="walletUrl(auth.sessions[c.id].user, c.id)" target="_blank" rel="noopener">{{ t('wallet') }}</a>
          <button class="small" @click="logout(c.id)">{{ t('logout') }}</button>
          <div v-if="wallets[c.id]?.has" class="mp-reward"><span>🎁 {{ wallets[c.id].label }}</span>
            <button class="pri small" :disabled="wallets[c.id].busy" @click="claim(c.id)">{{ wallets[c.id].busy ? '…' : t('claimBtn') }}</button></div>
        </div>
        <div v-if="auth.me && loggedChains().length > 1" class="mute mp-note">{{ t('logoutBlurtAll') }}</div>
        <button v-if="loggedChains().length < CHAINS.length" class="mp-row" @click="addAccount">＋ {{ t('addAccount') }}</button>
        <label v-if="auth.me" class="mp-row"><span>♥ {{ t('voteWeight') }}</span>
          <select class="sel" :value="voteWeight" @change="setVoteWeight(+($event.target as HTMLSelectElement).value)"><option v-for="w in [100, 75, 50, 25, 10]" :key="w" :value="w">{{ w }}%</option></select></label>
      </div>
    </template>
  </div>
    <!-- phone: the page links live in a bar at the bottom (big targets, the top bar keeps only language, rewards, bell and account) -->
    <nav v-if="loggedIn" class="bnav" aria-label="Menu">
      <a :class="{ on: state.view === 'feed' || (state.view === 'world' && state.tab !== 'tags' && !state.tag) }" :href="href({ view: 'world', tab: 'feed' })" @click.prevent="go(href({ view: 'world', tab: 'feed' }))"><span class="bi">📰</span>{{ t('feedTitle') }}</a>
      <a :class="{ on: state.view === 'world' && (state.tab === 'tags' || !!state.tag) }" :href="href({ view: 'world', tab: 'tags' })" @click.prevent="go(href({ view: 'world', tab: 'tags' }))"><span class="bi">#</span>{{ t('tagsTab') }}</a>
      <a v-if="auth.me && !isOwner" :href="myBlog"><span class="bi">🏠</span>{{ t('myBlog') }}</a>
      <template v-if="isOwner">
        <a :class="{ on: !state.view && !state.post }" :href="href({})" @click.prevent="go(href({}))"><span class="bi">🏠</span>{{ t('myBlog') }}</a>
        <a :class="{ on: state.view === 'write' }" :href="href({ view: 'write' })" @click.prevent="go(href({ view: 'write' }))"><span class="bi">✍</span>{{ t('write') }}</a>
        <a :class="{ on: state.view === 'settings' }" :href="href({ view: 'settings' })" @click.prevent="go(href({ view: 'settings' }))"><span class="bi">⚙</span>{{ t('settings') }}</a>
      </template>
    </nav>
  </header>
</template>
