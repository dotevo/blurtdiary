<script setup lang="ts">
import Icon from './Icon.vue';
import { computed, inject, ref } from 'vue';
import type { Post } from '../lib/types';
import { anyLogin, auth, loginOpen } from '../lib/auth';
import { benLabel, beneficiariesFor } from '../lib/ben';
import { adapter, CHAINS, type ChainThread } from '../lib/chains';
import { coalMap } from '../lib/coal';
import { toggleVoteAll, votedAll } from '../lib/actions';
import { openProfile, profileHref } from '../lib/store';
import { t } from '../lib/i18n';
import { useImageField } from '../lib/useImageField';
import { applyResult, chainsOf, commentTargets, describeResult, mirrorableChains, mirrorChains, mirrorComment, primaryOf, sendComment, versionsDiffer, type MNode } from '../lib/mirror';
import { toast } from '../lib/toast';
import { excerpt, fmtDate, payoutOf, payoutTitle, renderMd, stripFooter } from '../lib/util';
import ChainDot from './ChainDot.vue';
import DevTipToggle from './DevTipToggle.vue';
import UserAvatar from './UserAvatar.vue';
import VersionsModal from './VersionsModal.vue';
import VotesModal from './VotesModal.vue';

/**
 * One comment, merged from every chain that has it (matched by permlink).
 * `parent` = the copies of the parent post/comment per chain; replies go to the chains where we are logged in AND the parent exists.
 */
const props = defineProps<{ node: MNode; parent: Record<string, Post>; depth: number }>();
const threads = inject<Record<string, ChainThread>>('threads', {});

const c = computed(() => primaryOf(props.node.versions));
const chains = computed(() => chainsOf(props.node.versions));
const blurtCopy = computed(() => props.node.versions.blurt);
const coal = computed(() => (blurtCopy.value ? coalMap.value.get(blurtCopy.value.author.toLowerCase()) : undefined)); // COAL lists Blurt accounts
const shown = ref(false);
const showMirrors = computed(() => mirrorChains().length > 0);
const differs = computed(() => versionsDiffer(props.node.versions));
const versionsOpen = ref(false);
const votesOpen = ref(false);
/** Where does this comment exist? Present = solid, absent on a chain whose thread we read = dashed, thread unreachable = "!". */
const dots = computed(() => CHAINS.filter((x) => props.node.versions[x.id] || mirrorChains().some((m) => m.id === x.id) || x.id === 'blurt').map((x) => {
  const v = props.node.versions[x.id]; const th = threads[x.id];
  const status = v ? undefined : th?.status === 'found' || th?.status === 'missing' ? 'missing' as const : th?.status === 'error' ? 'error' as const : 'loading' as const;
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
const replyTa = ref<HTMLTextAreaElement | null>(null); const replyFile = ref<HTMLInputElement | null>(null);
const rimg = useImageField(text, replyTa);
async function sendReply(): Promise<void> {
  const v = text.value.trim(); if (!v || sending.value) return;
  if (!targets.value.length) { toast(t('noTargets')); loginOpen.value = true; return; }
  sending.value = true;
  const res = await sendComment(props.node.versions, v, rimg.images.value);
  applyResult(threads, props.node.versions, res);
  if (Object.keys(res.ok).length) { text.value = ''; rimg.images.value = {}; replying.value = false; }
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
      <UserAvatar :name="c.author" small /> <a class="au" :href="profileHref(c.author, chains[0]?.id ?? 'blurt')" :title="t('profileOpen')" @click.prevent="openProfile(c.author, chains[0]?.id ?? 'blurt')"><b>{{ c.author }}</b></a>
      <span v-if="showMirrors" class="cm-chains"><ChainDot v-for="d in dots" :key="d.id" :chain="d.id" :status="d.status" :title="d.title" /></span>
      <span v-if="coal" class="warn" :title="coal.reason + (coal.notes ? ' — ' + coal.notes : '')"><Icon name="warn" /> COAL</span>
      <span class="mute">{{ fmtDate(c.created) }} · <template v-for="x in chains" :key="x.id"><span class="pay" :title="payoutTitle(node.versions[x.id])"><ChainDot v-if="chains.length > 1" :chain="x.id" /> {{ payoutOf(node.versions[x.id]).toFixed(3) }} {{ x.payoutSymbol }}</span>{{ ' ' }}</template></span>
    </div>

    <!-- COAL author: only a blurred plain-text excerpt (no remote images/links are loaded) until the reader clicks -->
    <template v-if="coal && !shown">
      <div class="blur" aria-hidden="true">{{ excerpt(c.body) || '…' }}</div>
      <div class="coalbar">
        {{ t('coalWarn', { reason: coal.reason + (coal.notes ? ' — ' + coal.notes : '') }) }}
        <button @click="shown = true">{{ t('coalShow') }}</button>
      </div>
    </template>
    <div v-else class="md" v-html="renderMd(stripFooter(c.body))" />

    <div class="mute cm-actions">
      <!-- one click votes on every chain where we are logged in and a copy exists -->
      <a href="#" :class="{ on: votedAll(node.versions) }" :title="voteTitle" @click.prevent="toggleVoteAll(node.versions)"><Icon name="heart" /> {{ c.active_votes?.length ?? 0 }}</a>
      <a href="#" class="vinfo" :title="t('votesTitle')" :aria-label="t('votesTitle')" @click.prevent="votesOpen = true">ⓘ</a>
      <a href="#" @click.prevent="startReply">{{ t('reply') }}</a>
      <span v-if="node.children.length">{{ t('repliesCount', { n: node.children.length }) }}</span>
      <a v-if="differs" href="#" class="vdiff" :title="accounts()" @click.prevent="versionsOpen = true"><Icon name="warn" /> {{ t('versionsDiffer') }}</a>
      <button v-for="x in canSendTo" :key="x.id" class="small" :disabled="busyChain === x.id" @click="sendCopy(x.id)">{{ t('sendTo', { c: x.name }) }}</button>
    </div>
    <div v-if="replying" class="reply-box">
      <textarea ref="replyTa" v-model="text" rows="3" :placeholder="t('replyPh', { a: c.author })" @paste="rimg.onPaste" @drop="rimg.onDrop" @dragover.prevent />
      <div class="mute target-note">{{ targets.length ? t('willSendTo', { list: targetNote }) : t('noTargets') }}</div>
      <div class="actions"><button class="pri" :disabled="sending || rimg.uploading.value || !text.trim()" @click="sendReply">{{ t('send') }}</button>
        <input ref="replyFile" type="file" accept="image/*" hidden @change="rimg.onPick">
        <button :disabled="rimg.uploading.value" @click="replyFile?.click()"><Icon name="image" /> {{ rimg.uploading.value ? t('uploading') : t('uploadImage') }}</button><button @click="replying = false">{{ t('cancel') }}</button></div>
      <DevTipToggle :list="benText" />
    </div>
    <CommentNode v-for="r in node.children" :key="r.permlink" :node="r" :parent="node.versions" :depth="depth + 1" />
    <VotesModal v-if="votesOpen" :versions="node.versions" @close="votesOpen = false" />
    <VersionsModal v-if="versionsOpen" :versions="node.versions" @close="versionsOpen = false" />
  </div>
</template>
