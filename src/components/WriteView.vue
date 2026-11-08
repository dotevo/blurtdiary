<script setup lang="ts">
import Icon from './Icon.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { loadSubscriptions, type Sub } from '../lib/communities';
import { auth, loginOpen } from '../lib/auth';
import { benLabel, beneficiariesFor } from '../lib/ben';
import { t } from '../lib/i18n';
import { buildTags, COMMUNITY_RE, MAX_TAGS, publishPost } from '../lib/publish';
import { publishPlan } from '../lib/mirror';
import { href, navigate, USER } from '../lib/store';
import { toast } from '../lib/toast';
import { uploadEverywhere, type ImageMap } from '../lib/upload';
import { renderMd } from '../lib/util';
import DevTipToggle from './DevTipToggle.vue';
import ImportView from './ImportView.vue';

const owner = computed(() => auth.me?.user === USER);
const DRAFT = `bd-draft-${USER}`;
const images = ref<ImageMap>({}); // Blurt image URL -> the same image on the other chains (uploaded separately to each host)
const title = ref(''); const body = ref(''); const tagsText = ref(''); const community = ref('');
const subs = ref<Sub[]>([]);
watch(() => auth.sessions.blurt?.user, (u) => { subs.value = []; if (u) void loadSubscriptions(u).then((l) => { subs.value = l; }); }, { immediate: true });
const tab = ref<'edit' | 'preview'>('edit');
const mode = ref<'write' | 'import'>('write');
const source = ref(''); // article this draft was imported from (kept with the draft, sent as json_metadata.rss_source)
/** A post picked in the import mode lands in the editor, to be checked and published like any other. */
function onImport(p: { title: string; body: string; tags: string; source: string }): void {
  if ((title.value.trim() || body.value.trim()) && !window.confirm(t('rssOverwrite'))) return;
  title.value = p.title; body.value = p.body; tagsText.value = p.tags; images.value = {}; source.value = p.source;
  mode.value = 'write'; tab.value = 'edit'; toast(t('rssImported'));
}
const busy = ref(false); const uploading = ref(false); let published = false;
const ta = ref<HTMLTextAreaElement | null>(null); const fileInput = ref<HTMLInputElement | null>(null);

// ---- draft kept in this browser (restored on open, saved while typing)
try {
  const d = JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
  if (d) { title.value = d.title ?? ''; body.value = d.body ?? ''; tagsText.value = d.tagsText ?? ''; community.value = d.community ?? ''; images.value = d.images ?? {}; source.value = typeof d.source === 'string' ? d.source : ''; }
} catch { /* ignore */ }
const saveDraft = (): void => {
  if (published) return;
  try {
    if (title.value || body.value || tagsText.value || community.value) localStorage.setItem(DRAFT, JSON.stringify({ title: title.value, body: body.value, tagsText: tagsText.value, community: community.value, images: images.value, source: source.value }));
    else localStorage.removeItem(DRAFT);
  } catch { /* ignore */ }
};
let timer: ReturnType<typeof setTimeout>;
watch([title, body, tagsText, community], () => { clearTimeout(timer); timer = setTimeout(saveDraft, 500); });
onBeforeUnmount(() => { clearTimeout(timer); saveDraft(); });

const comm = computed(() => community.value.trim().toLowerCase());
const communityBad = computed(() => !!comm.value && !COMMUNITY_RE.test(comm.value));
const parsed = computed(() => buildTags(tagsText.value, communityBad.value ? '' : comm.value));
const where = computed(() => (comm.value && !communityBad.value ? t('whereCommunity', { c: comm.value }) : t('whereTag', { tag: parsed.value.primary })));
const plan = computed(() => publishPlan());
const benText = computed(() => auth.me
  ? benLabel(beneficiariesFor(auth.me.user, { author: '', permlink: '', title: '', body: '', created: '', community_name: comm.value && !communityBad.value ? comm.value : undefined })) : '');

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement; const f = input.files?.[0]; input.value = '';
  if (f) await uploadFile(f);
}
/** Ctrl+V of a screenshot or copied image: upload it and put it in at the cursor. Plain-text pastes are left alone. */
function onPaste(e: ClipboardEvent): void {
  const f = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
  if (!f) return;
  e.preventDefault();
  if (!uploading.value) void uploadFile(f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type }));
}
async function uploadFile(f: File): Promise<void> {
  uploading.value = true;
  try {
    const { url, others, failed } = await uploadEverywhere(f);
    images.value[url] = others;
    if (failed.length) toast(t('uploadPartial', { fail: failed.join(', ') }));
    const md = `\n![image](${url})\n`;
    const el = ta.value; const s = el?.selectionStart ?? body.value.length, en = el?.selectionEnd ?? body.value.length;
    body.value = body.value.slice(0, s) + md + body.value.slice(en);
  } catch (err) { toast((err as Error).message || t('uploadFailed')); }
  uploading.value = false;
}

async function submit(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await publishPost({ title: title.value, body: body.value, tagsText: tagsText.value, community: comm.value, images: images.value, source: source.value });
    published = true; try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
    const failed = Object.entries(r.failed).map(([c, e]) => `${c} (${e})`);
    toast(failed.length ? t('postPublishedPartial', { fail: failed.join(', ') }) : t('postPublished')); navigate(href({}));
  } catch (err) { toast((err as Error).message); }
  busy.value = false;
}
</script>

<template>
  <div v-if="!owner" class="article"><div class="art-in center">
    <p>{{ t('ownerOnly', { u: USER }) }}</p>
    <button v-if="!auth.me" class="pri" @click="loginOpen = true">{{ t('login') }}</button>
  </div></div>

  <div v-else class="article"><div class="art-in form">
    <a class="back" :href="href({})" @click.prevent="navigate(href({}))">{{ t('allPosts') }}</a>
    <h1>{{ t('newPost') }}</h1>
    <div class="tabs mode-tabs">
      <button :class="{ pri: mode === 'write' }" @click="mode = 'write'"><Icon name="pen" /> {{ t('modeWrite') }}</button>
      <button :class="{ pri: mode === 'import' }" @click="mode = 'import'"><Icon name="download" /> {{ t('modeImport') }}</button>
    </div>
    <ImportView v-show="mode === 'import'" @import="onImport" />
    <template v-if="mode === 'write'">
    <input v-model="title" class="title-in" :placeholder="t('titlePh')" maxlength="255">

    <div class="tabs">
      <button :class="{ pri: tab === 'edit' }" @click="tab = 'edit'">{{ t('tabEdit') }}</button>
      <button :class="{ pri: tab === 'preview' }" @click="tab = 'preview'">{{ t('tabPreview') }}</button>
      <span class="grow" />
      <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile">
      <button :disabled="uploading" @click="fileInput?.click()"><Icon name="image" /> {{ uploading ? t('uploading') : t('uploadImage') }}</button>
    </div>
    <textarea v-show="tab === 'edit'" ref="ta" @paste="onPaste" v-model="body" class="body-in" rows="18" :placeholder="t('bodyPh')" />
    <div v-show="tab === 'preview'" class="md post-body preview" v-html="renderMd(body)" />

    <label class="lbl">{{ t('tags') }}</label>
    <input v-model="tagsText" placeholder="travel, photo, diary" autocapitalize="off">
    <div class="mute help">{{ t('tagsHelp') }} ({{ parsed.tags.length }}/{{ MAX_TAGS }})</div>

    <label class="lbl">{{ t('communityLabel') }}</label>
    <select v-if="subs.length" class="comm-pick" :value="subs.some((x) => x.id === comm) ? comm : ''" @change="community = ($event.target as HTMLSelectElement).value">
      <option value="">{{ t('communityPick') }}</option>
      <option v-for="x in subs" :key="x.id" :value="x.id">{{ x.title }} ({{ x.id }})</option>
    </select>
    <input v-model="community" :class="{ bad: communityBad }" placeholder="blurt-179874" autocapitalize="off">
    <div class="mute help" :class="{ badtxt: communityBad }">{{ communityBad ? t('communityInvalid') : t('communityHelp') }}</div>

    <div class="mute help"><b>{{ t('postGoesTo', { where }) }}</b></div>
    <div v-if="plan.targets.length" class="mute help">{{ t('publishAlso', { list: plan.targets.map((x) => `${x.chain.name} (@${x.account})`).join(', ') }) }}</div>
    <div v-for="s in plan.skipped" :key="s.chain.id" class="mute help badtxt">
      {{ s.reason === 'noAccount' ? t('skipNoAccount', { c: s.chain.name, a: s.has ?? '' }) : t('skipMismatch', { c: s.chain.name, a: s.has ?? '', b: s.want ?? '' }) }}
    </div>
    <div class="mute help">{{ t('draftNote') }}</div>
    <div class="actions"><button class="pri" :disabled="busy || uploading" @click="submit">{{ busy ? t('publishing') : t('publish') }}</button></div>
    </template>

    <!-- very bottom: dev tip switch -->
    <DevTipToggle :list="benText" />
  </div></div>
</template>
