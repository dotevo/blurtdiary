<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import SponsoredModal from './SponsoredModal.vue';
import { t } from '../lib/i18n';
import { addToPlaylist, addToQueue, clearHistory, clearQueue, cycleMode, deletePlaylist, dockVisible, frameLoaded, frameSrc, hasVideo, lists, newPlaylist, next, pl, playFromQueue, playNow, playPlaylist, prev, removeFromPlaylist, removeFromQueue, seek, setPinned, setVolume, stopPlayer, toggle, trackCover } from '../lib/player';
import type { Track } from '../lib/player';
import { auth } from '../lib/auth';

/**
 * The player: a card docked at the bottom. Shown only while something plays (or when a logged-in user pinned it).
 * Collapsed: thumbnail, title and controls. Expanded: the video (when there is one) next to / above the queue and playlists views.
 * The video frame is always mounted (it is the player itself); while collapsed it is simply parked out of sight.
 */
const fmt = (s: number): string => { const v = Math.max(0, Math.floor(s || 0)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const cur = computed(() => pl.current);
const src = computed(() => frameSrc(cur.value));
const cover = computed(() => trackCover(cur.value));
const showVideo = computed(() => pl.expanded && hasVideo.value);
const close = (): void => { stopPlayer(); if (pl.pinned && !auth.me) setPinned(false); };
const hide = (): void => { stopPlayer(); setPinned(false); };
const showAds = ref(false); const newName = ref(''); const open = ref('');
const create = (): void => { const p = newPlaylist(newName.value); if (p) { newName.value = ''; open.value = p.id; } };
const pickList = (e: Event, tr: Track): void => { const el = e.target as HTMLSelectElement; if (el.value) addToPlaylist(el.value, tr); el.value = ''; };
const modeIcon: Record<string, string> = { sequential: '→', shuffle: '⤮', 'repeat-all': '⟲', 'repeat-one': '⟲1' };
const nextAuto = computed(() => { const i = cur.value ? pl.auto.findIndex((x) => x.key === cur.value?.key) : -1; return pl.auto.slice(i + 1); });
const tabs = ['queue', 'lists'] as const;
</script>
<template>
  <template v-if="dockVisible">
    <aside class="pdock" :class="{ exp: pl.expanded, withvid: showVideo }" :aria-label="t('playerTitle')">
      <div class="pd-left">
        <div v-if="hasVideo && src" class="pd-stage" :class="{ show: showVideo }">
          <iframe :key="(cur?.key ?? '') + pl.nonce + src" :src="src" title="player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" @load="frameLoaded($event.target as HTMLIFrameElement)" />
        </div>
        <div class="pd-bar">
          <img v-if="cover" :key="cover" class="pd-cover" :src="cover" alt="" referrerpolicy="no-referrer">
          <span v-else class="pd-cover ph"><Icon name="music" /></span>
          <div class="pd-info">
            <template v-if="cur"><b class="pd-title">{{ cur.title }}</b>
              <span class="mute pd-sub"><template v-if="pl.error">{{ t('playerError') }}</template><template v-else><span v-if="pl.loading" class="spinner" /> {{ fmt(pl.time) }} / {{ fmt(pl.duration) }}</template><template v-if="pl.queue.length"> · {{ t('playerUpNext') }}: {{ pl.queue.length }}</template></span></template>
            <span v-else class="mute">{{ t('playerEmpty') }}</span>
          </div>
          <div class="pd-ctl">
            <template v-if="cur">
              <button class="icon" :title="t('playerPrev')" :aria-label="t('playerPrev')" @click="prev"><Icon name="skip-prev" /></button>
              <button class="icon pd-play" :title="pl.playing ? t('playerPause') : t('playerPlay')" :aria-label="pl.playing ? t('playerPause') : t('playerPlay')" @click="toggle"><Icon :name="pl.playing ? 'pause' : 'play'" /></button>
              <button class="icon" :title="t('playerNext')" :aria-label="t('playerNext')" @click="next()"><Icon name="skip-next" /></button>
              <button class="icon pd-mode" :class="{ on: pl.mode !== 'sequential' }" :title="t('playerMode_' + pl.mode)" :aria-label="t('playerMode_' + pl.mode)" @click="cycleMode">{{ modeIcon[pl.mode] }}</button>
              <button v-if="cur.sponsored" class="icon on" :title="t('spTitle')" :aria-label="t('spTitle')" @click="showAds = true"><Icon name="coin" /></button>
            </template>
            <button class="icon" :class="{ on: pl.expanded }" :title="t('playerExpand')" :aria-label="t('playerExpand')" :aria-expanded="pl.expanded" @click="pl.expanded = !pl.expanded"><Icon name="expand" /></button>
            <button class="icon" :title="pl.pinned ? t('playerHide') : t('playerClose')" :aria-label="pl.pinned ? t('playerHide') : t('playerClose')" @click="pl.pinned ? hide() : close()"><Icon name="x" /></button>
          </div>
        </div>
        <div v-if="cur" class="pd-seek">
          <input type="range" min="0" :max="pl.duration || 0" step="1" :value="pl.time" :disabled="!pl.duration" :aria-label="t('playerSeek')" @input="seek(+($event.target as HTMLInputElement).value)">
          <input class="pd-vol" type="range" min="0" max="1" step="0.05" :value="pl.volume" :aria-label="t('playerVolume')" @input="setVolume(+($event.target as HTMLInputElement).value)">
        </div>
        <div v-if="pl.expanded && cur && !cur.sponsored" class="pd-acts">
          <button class="small" @click="addToQueue(cur)">＋ {{ t('playerAddQueue') }}</button>
          <select class="sel" :aria-label="t('playerAddToList')" @change="pickList($event, cur)"><option value="">＋ {{ t('playerAddToList') }}…</option><option v-for="p in lists.items" :key="p.id" :value="p.id">{{ p.name }}</option></select>
        </div>
      </div>

      <div v-if="pl.expanded" class="pd-panel">
        <div class="pd-tabs" role="tablist">
          <button v-for="k in tabs" :key="k" role="tab" :class="{ on: pl.tab === k }" :aria-selected="pl.tab === k" @click="pl.tab = k">{{ t('playerTab_' + k) }}<template v-if="k === 'queue' && pl.queue.length"> ({{ pl.queue.length }})</template></button>
        </div>
        <div v-if="pl.tab === 'queue'" class="pd-q">
          <h5>{{ t('playerUpNext') }} <button v-if="pl.queue.length" class="linklike mute" @click="clearQueue">{{ t('playerClear') }}</button></h5>
          <p v-if="!pl.queue.length" class="mute">{{ t('playerQueueEmpty') }}</p>
          <ol v-else><li v-for="(q, i) in pl.queue" :key="q.key + i"><button class="linklike" @click="playFromQueue(i)">{{ q.title }}</button><button class="icon small" :title="t('playerRemove')" @click="removeFromQueue(i)"><Icon name="x" /></button></li></ol>
          <template v-if="nextAuto.length"><h5>{{ t('playerAuto') }}</h5>
            <ol><li v-for="q in nextAuto" :key="q.key"><button class="linklike" @click="playNow(q)">{{ q.title }}</button><button class="icon small" :title="t('playerAddQueue')" @click="addToQueue(q)">＋</button></li></ol></template>
          <template v-if="pl.history.length"><h5>{{ t('playerHistory') }} <button class="linklike mute" @click="clearHistory">{{ t('playerClear') }}</button></h5>
            <ol><li v-for="(q, i) in [...pl.history].reverse().slice(0, 15)" :key="q.key + i"><button class="linklike" @click="playNow(q)">{{ q.title }}</button><button class="icon small" :title="t('playerAddQueue')" @click="addToQueue(q)">＋</button></li></ol></template>
        </div>
        <div v-else class="pd-l">
          <form class="pd-new" @submit.prevent="create"><input v-model="newName" maxlength="60" :placeholder="t('playerListName')"><button class="small" :disabled="!newName.trim()">＋ {{ t('playerNewList') }}</button></form>
          <p v-if="!lists.items.length" class="mute">{{ t('playerNoLists') }}</p>
          <div v-for="p in lists.items" :key="p.id" class="pd-list-i">
            <div class="pd-lh"><button class="linklike" @click="open = open === p.id ? '' : p.id"><b>{{ p.name }}</b> <span class="mute">({{ p.tracks.length }})</span></button><span class="grow" />
              <button class="small" :disabled="!p.tracks.length" @click="playPlaylist(p.id)"><Icon name="play" /> {{ t('playerPlayAll') }}</button>
              <button class="icon small" :title="t('playerDelete')" @click="deletePlaylist(p.id)"><Icon name="x" /></button></div>
            <ol v-if="open === p.id"><li v-for="(q, i) in p.tracks" :key="q.key"><button class="linklike" @click="playPlaylist(p.id, i)">{{ q.title }}</button><button class="icon small" :title="t('playerAddQueue')" @click="addToQueue(q)">＋</button><button class="icon small" :title="t('playerRemove')" @click="removeFromPlaylist(p.id, i)"><Icon name="x" /></button></li>
              <li v-if="!p.tracks.length" class="mute">{{ t('playerListEmpty') }}</li></ol>
          </div>
        </div>
      </div>
    </aside>
    <Teleport to="body"><SponsoredModal v-if="showAds" @close="showAds = false" /></Teleport>
  </template>
</template>
