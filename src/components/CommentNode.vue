<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { Post } from '../lib/types';
import { anyLogin, auth, loginOpen } from '../lib/auth';
import { benLabel, beneficiariesFor } from '../lib/ben';
import { adapter, CHAINS, type ChainThread } from '../lib/chains';
import { coalMap } from '../lib/coal';
import { toggleVoteAll, votedAll } from '../lib/actions';
import { t } from '../lib/i18n';
import { applyResult, chainsOf, commentTargets, describeResult, mirrorableChains, mirrorChains, mirrorComment, primaryOf, sendComment, versionsDiffer, type MNode } from '../lib/mirror';
import { toast } from '../lib/toast';
import { excerpt, fmtDate, payoutOf, payoutTitle, renderMd } from '../lib/util';
import ChainDot from './ChainDot.vue';
import DevTipToggle from './DevTipToggle.vue';
import UserAvatar from './UserAvatar.vue';
import VersionsModal from './VersionsModal.vue';

/**
 * One comment, merged from every chain that has it (matched by permlink).
 * `parent` = the copies of the parent post/comment per chain; replies go to the chains where we are logged in AND the parent exists.
 */
const props = defineProps<{ node: MNode; parent: Record<string, Post>; depth: number }>();
const threads = inject<Record<string, ChainThread>>('threads', {});

const c = computed(() => primaryOf(props.node.versions));
const chains = computed(() => chainsOf(props.node.versions));
const primaryChain = computed(() => chains.value[0]);
const blurtCopy = computed(() => props.node.versions.blurt);
const coal = computed(() => (blurtCopy.value ? coalMap.value.get(blurtCopy.value.author.toLowerCase()) : undefined)); // COAL lists Blurt accounts
const shown = ref(false);
const showMirrors = computed(() => mirrorChains().length > 0);
const differs = computed(() => versionsDiffer(props.node.versions));
const versionsOpen = ref(false);
/** Where does this comment exist? Present = solid, absent on a chain whose thread we read = dashed, thread unreachable = "!". */
const dots = computed(() => CHAINS.filter((x) => props.node.versions[x.id] || mirrorChains().some((m) => m.id === x.id) || x.id === 'blurt').map((x) => {
  const v = props.node.versions[x.id]; const th = threads[x.id];
  const status = v ? undefined : th?.status === 'found' ? 'missing' as const : th?.status === 'error' ? 'error' as const : 'loading' as const;
  const msg = v ? t('chainFoundAs', { c: x.name, a: v.author }) : status === 'missing' ? t('chainMissing', { c: x.name }) : status === 'error' ? t('chainError', { c: x.name }) : t('chainChecking', { c: x.name });
  return { id: x.id, status, title: msg };
}));
const voteTitle = computed(() => chains.value.map((x) => `${x.name}: ♥ ${props.node.versions[x.id].active_votes?.length ?? 0}`).join('\n'));
const accounts = (): string => chains.value.map((x) => `${x.name}: @${props.node.versions[x.id].author}`).join('\n');

const replying = ref(false); const text = ref(''); const sending = ref(false);
const benText = computed(() => (auth.me ? benLabel(beneficiariesFor(auth.me.user, c.value)) : ''));
const targets = computed(() => commentTargets(props.node.versions));
const targetNote = computed(() => targets.value.map((x) => `@${auth.sessions[x.id].user} (${x.name})`).join(', '));
const canSendTo = computed(() => mirrorableChains(props.node, props.parent));
const busyChain = ref('');

function startReply(): void {
  if (!anyLogin()) { loginOpen.value = true; return; }
  replying.value = !replying.value;
}
async function sendReply(): Promise<void> {
  const v = text.value.trim(); if (!v || sending.value) return;
  if (!targets.value.length) { toast(t('noTargets')); loginOpen.value = true; return; }
  sending.value = true;
  const res = await sendComment(props.node.versions, v);
  applyResult(threads, props.node.versions, res);
  if (Object.keys(res.ok).length) { text.value = ''; replying.value = false; }
  toast(describeResult(res, t('replySent')));
  sending.value = false;
}
async function sendCopy(chain: string): Promise<void> {
  busyChain.value = chain;
  try {
    const p = await mirrorComment(chain, props.node, props.parent);
    applyResult(threads, props.parent, { ok: { [chain]: p }, failed: {} });
    toast(t('sentTo', { list: adapter(chain).name }));
  } catch (e) { toast((e as Error).message); }
  busyChain.value = '';
}
</script>

<template>
  <div class="cm" :class="{ flat: depth >= 5 }" :data-ck="`${c.author}/${c.permlink}`">
    <div class="cm-head">
      <UserAvatar :name="c.author" small /> <b>{{ c.author }}</b>
      <span v-if="showMirrors" class="cm-chains"><ChainDot v-for="d in dots" :key="d.id" :chain="d.id" :status="d.status" :title="d.title" /></span>
      <span v-if="coal" class="warn" :title="coal.reason + (coal.notes ? ' — ' + coal.notes : '')">⚠ COAL</span>
      <span class="mute">{{ fmtDate(c.created) }} · <span class="pay" :title="payoutTitle(c)">{{ payoutOf(c).toFixed(3) }} {{ primaryChain.symbol }}</span></span>
    </div>

    <!-- COAL author: only a blurred plain-text excerpt (no remote images/links are loaded) until the reader clicks -->
    <template v-if="coal && !shown">
      <div class="blur" aria-hidden="true">{{ excerpt(c.body) || '…' }}</div>
      <div class="coalbar">
        {{ t('coalWarn', { reason: coal.reason + (coal.notes ? ' — ' + coal.notes : '') }) }}
        <button @click="shown = true">{{ t('coalShow') }}</button>
      </div>
    </template>
    <div v-else class="md" v-html="renderMd(c.body)" />

    <div class="mute cm-actions">
      <!-- one click votes on every chain where we are logged in and a copy exists -->
      <a href="#" :class="{ on: votedAll(node.versions) }" :title="voteTitle" @click.prevent="toggleVoteAll(node.versions)">♥ {{ c.active_votes?.length ?? 0 }}</a>
      <a href="#" @click.prevent="startReply">{{ t('reply') }}</a>
      <span v-if="node.children.length">{{ t('repliesCount', { n: node.children.length }) }}</span>
      <a v-if="differs" href="#" class="vdiff" :title="accounts()" @click.prevent="versionsOpen = true">⚠ {{ t('versionsDiffer') }}</a>
      <button v-for="x in canSendTo" :key="x.id" class="small" :disabled="busyChain === x.id" @click="sendCopy(x.id)">{{ t('sendTo', { c: x.name }) }}</button>
    </div>
    <div v-if="replying" class="reply-box">
      <textarea v-model="text" rows="3" :placeholder="t('replyPh', { a: c.author })" />
      <div class="mute target-note">{{ targets.length ? t('willSendTo', { list: targetNote }) : t('noTargets') }}</div>
      <div class="actions"><button class="pri" :disabled="sending || !text.trim()" @click="sendReply">{{ t('send') }}</button><button @click="replying = false">{{ t('cancel') }}</button></div>
      <DevTipToggle v-if="benText" :list="benText" />
    </div>
    <CommentNode v-for="r in node.children" :key="r.permlink" :node="r" :parent="node.versions" :depth="depth + 1" />
    <VersionsModal v-if="versionsOpen" :versions="node.versions" @close="versionsOpen = false" />
  </div>
</template>
