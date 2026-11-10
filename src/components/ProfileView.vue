<script setup lang="ts">
import Icon from './Icon.vue';
import { computed, ref, watch } from 'vue';
import { auth, loginOpen } from '../lib/auth';
import { adapter, CHAINS } from '../lib/chains';
import { t } from '../lib/i18n';
import { info, loadInfo, loadRel, rel, setRel } from '../lib/profile';
import { useWindow } from '../lib/useWindow';
import { accountWindow, loadWorldAccount, worldAccount, worldAccountMore } from '../lib/world';
import { state } from '../lib/store';
import ChainDot from './ChainDot.vue';
import MoreSentinel from './MoreSentinel.vue';
import UserAvatar from './UserAvatar.vue';
import WorldCard from './WorldCard.vue';

/** A person on one chain (`?view=profile&account=…&chain=…`): who they are, their posts, and a follow button for the account you are logged in with on that chain. */
const chain = computed(() => (CHAINS.some((c) => c.id === state.chain) ? state.chain : 'blurt'));
const account = computed(() => state.account);
const ad = computed(() => adapter(chain.value));
const me = computed(() => auth.sessions[chain.value]?.user);
watch([chain, account, me], () => {
  if (!account.value) return;
  document.title = `@${account.value} (${ad.value.name}) – Blurt Diary`;
  void loadInfo(chain.value, account.value); void loadWorldAccount(chain.value, account.value); void loadRel(chain.value, account.value);
}, { immediate: true });
const gridEl = ref<HTMLElement | null>(null);
useWindow(gridEl, () => worldAccount, () => accountWindow);
const problem = computed(() => Object.values(worldAccount.sources).map((s) => s.error).find(Boolean));
</script>
<template>
  <section class="world profile">
    <div v-if="!account" class="center mute">{{ t('postNotFound') }}</div>
    <template v-else>
      <div class="prof-head">
        <UserAvatar :name="account" />
        <div class="grow">
          <h2 class="feed-h"><ChainDot :chain="chain" /> @{{ account }} <span class="mute help">{{ ad.name }}</span></h2>
          <div v-if="info.name" class="mute">{{ info.name }}</div>
          <div v-if="info.about" class="mute help">{{ info.about }}</div>
        </div>
        <div class="prof-act">
          <button v-if="me && me !== account && rel.state !== 'unknown'" class="small follow" :class="{ on: rel.state === 'yes' }" :disabled="rel.busy" @click="setRel(chain, account, rel.state !== 'yes')"><Icon :name="rel.state === 'yes' ? 'check' : 'plus'" /> {{ rel.state === 'yes' ? t('following') : t('follow') }}</button>
          <button v-else-if="!me" class="small" @click="loginOpen = true">{{ t('profileLogin', { c: ad.name }) }}</button>
          <a v-if="chain === 'blurt'" class="small btn" :href="`?user=${encodeURIComponent(account)}`">{{ t('profileBlog') }}</a>
        </div>
      </div>
      <div v-if="!info.loading && !info.exists && !info.error" class="center mute">{{ t('accountNotFound', { u: account }) }}</div>
      <div v-if="problem" class="mute help badtxt"><Icon name="warn" /> {{ ad.name }}: {{ problem }}</div>
      <div v-if="worldAccount.items.length" ref="gridEl" class="grid"><WorldCard v-for="it in worldAccount.items" :key="it.key" :item="it" @retry="accountWindow.retry" /></div>
      <div v-else-if="worldAccount.loading" class="mute center">{{ t('loading') }}</div>
      <div v-else-if="info.exists" class="mute center">{{ t('noPosts') }}</div>
      <MoreSentinel v-if="worldAccount.items.length" :can="worldAccountMore()" :loading="worldAccount.loading" @more="loadWorldAccount(chain, account, true)" />
    </template>
  </section>
</template>
