<script setup lang="ts">
import { computed } from 'vue';
import ChainDot from './ChainDot.vue';
import Icon from './Icon.vue';
import { auth } from '../lib/auth';
import { CHAINS } from '../lib/chains';
import { toggleVoteOn, votedBy } from '../lib/actions';
import { oldChains, peekPlan, planOf, triggerSupport } from '../lib/support';
import { t } from '../lib/i18n';
import { isOld } from '../lib/util';
import type { Post } from '../lib/types';

/**
 * Wraps the heart button (slot). On a desktop (hover) the heart shows the votes of every chain and lets you vote on ONE chain; where the content is past
 * its payout window on a chain you are logged in to, a second "gift" button offers support – with the same per-chain list (new support post /
 * existing one / already done). On touch screens only the buttons are shown, the lists live in the support window.
 */
const props = defineProps<{ versions: Record<string, Post> }>();
const copies = computed(() => CHAINS.filter((c) => props.versions[c.id]));
const old = computed(() => oldChains(props.versions));
const mine = (c: string): boolean => !!auth.sessions[c] && votedBy(props.versions[c], auth.sessions[c].user);
const peek = (): void => { for (const c of old.value) void peekPlan(c.id, props.versions[c.id]); };
const stateText = (c: string): string => {
  const p = planOf(c, props.versions[c]);
  return !p || p.state === 'checking' ? t('supChecking') : p.state === 'new' ? t('supNew') : p.state === 'existing' ? t('supExisting') : p.state === 'done' ? t('supDone') : '';
};
const isChecking = (c: string): boolean => { const p = planOf(c, props.versions[c]); return !p || p.state === 'checking'; };
</script>
<template>
  <span class="vbox">
    <span class="vh">
      <slot />
      <span v-if="copies.length > 1 || old.length" class="vpop" role="tooltip"><span class="vpop-in">
        <span class="vp-h">{{ t('votesTitle') }}</span>
        <button v-for="c in copies" :key="c.id" class="vp-row" :disabled="!auth.sessions[c.id]" :title="auth.sessions[c.id] ? (isOld(versions[c.id]) ? t('supportTitle') : mine(c.id) ? t('unvoteOn', { c: c.name }) : t('voteOn', { c: c.name })) : t('notLoggedOn', { c: c.name })" @click.prevent.stop="toggleVoteOn(versions, c.id)">
          <ChainDot :chain="c.id" /><span class="grow">{{ c.name }}</span>
          <span v-if="isOld(versions[c.id])" class="mute">{{ t('oldOtherChain') }}</span>
          <span class="vp-n"><Icon :name="mine(c.id) ? 'heart-fill' : 'heart'" /> {{ versions[c.id].active_votes?.length ?? 0 }}</span>
        </button>
      </span></span>
    </span>
    <span v-if="old.length" class="vg">
      <button class="vbtn giftbtn" :title="t('supportTitle')" :aria-label="t('supportTitle')" @mouseenter="peek" @focus="peek" @click.prevent.stop="triggerSupport(versions)"><Icon name="gift" /></button>
      <span class="vpop" role="tooltip"><span class="vpop-in">
        <span class="vp-h">{{ t('supportTitle') }}</span>
        <button v-for="c in old" :key="c.id" class="vp-row" @click.prevent.stop="triggerSupport(versions, [c.id])">
          <ChainDot :chain="c.id" /><span class="grow">{{ c.name }}</span>
          <span class="mute vp-st"><span v-if="isChecking(c.id)" class="spinner" /> {{ stateText(c.id) }}</span>
        </button>
      </span></span>
    </span>
  </span>
</template>
