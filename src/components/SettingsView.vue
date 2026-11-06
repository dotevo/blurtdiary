<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { auth, loginOpen } from '../lib/auth';
import { CHAINS, PRIMARY } from '../lib/chains';
import { UI_OPTIONS, CONFIG_PERMLINK, DEFAULT_PANELS, MAX_CUSTOM_PANELS, BUILTIN_PANELS, MAX_BLOGROLL, normAccount, normPermlink, parseTags, safeUrl } from '../lib/config';
import { LANGS, t } from '../lib/i18n';
import { saveConfig } from '../lib/publish';
import { href, navigate, state, USER } from '../lib/store';
import { applyTheme, PALETTES } from '../lib/theme';
import SideBar from './SideBar.vue';
import { toast } from '../lib/toast';
import { slug } from '../lib/util';
import type { BlogCategory } from '../lib/types';
import { ref } from 'vue';

const owner = computed(() => auth.me?.user === USER);
// The form edits state.cfg directly, so the whole page is a live preview. Cancel/leave restores the backup.
const c = state.cfg;
const backup = JSON.parse(JSON.stringify(state.cfg));
let saved = false;
const busy = ref(false);
watch(c, () => applyTheme(c), { deep: true });
function setUi(k: string, val: string): void {
  const ui = { ...(c.ui ?? {}) }; if (val === UI_OPTIONS[k][0]) delete ui[k]; else ui[k] = val;
  c.ui = Object.keys(ui).length ? ui : undefined;
}
onBeforeUnmount(() => { if (!saved) { state.cfg = backup; applyTheme(backup); } });

const pal = computed(() => PALETTES[c.palette ?? ''] ?? PALETTES.default);
const eff = computed(() => ({
  accent: c.accent ?? pal.value.light.accent, accentDark: c.accentDark ?? c.accent ?? pal.value.dark.accent,
  bg: c.bg ?? pal.value.light.bg, bgDark: c.bgDark ?? pal.value.dark.bg,
  text: c.text ?? pal.value.light.text, textDark: c.textDark ?? pal.value.dark.text,
  card: c.card ?? pal.value.light.card, cardDark: c.cardDark ?? pal.value.dark.card,
  line: c.line ?? pal.value.light.line, lineDark: c.lineDark ?? pal.value.dark.line,
}));
type ColorKey = 'accent' | 'accentDark' | 'bg' | 'bgDark' | 'text' | 'textDark' | 'card' | 'cardDark' | 'line' | 'lineDark';
const colors: { key: ColorKey; label: string }[] = [
  { key: 'accent', label: 'fAccent' }, { key: 'accentDark', label: 'fAccentDark' }, { key: 'bg', label: 'fBg' }, { key: 'bgDark', label: 'fBgDark' },
  { key: 'text', label: 'fText' }, { key: 'textDark', label: 'fTextDark' }, { key: 'card', label: 'fCard' }, { key: 'cardDark', label: 'fCardDark' }, { key: 'line', label: 'fLine' }, { key: 'lineDark', label: 'fLineDark' },
];
const palLabel = (k: string): string => t('pal' + k[0].toUpperCase() + k.slice(1));
function pickPalette(k: string): void { c.palette = k; c.accent = c.accentDark = c.bg = c.bgDark = c.text = c.textDark = c.card = c.cardDark = c.line = c.lineDark = undefined; }
const setColor = (k: ColorKey, v: string): void => { c[k] = v; };

// sidebar panels: an ordered list; built-in ones by id, custom ones with a title and text
if (!c.panels) c.panels = DEFAULT_PANELS.map((x) => ({ ...x })); // make the implicit default explicit so it can be edited
const panelsList = computed(() => c.panels ?? []);
const panelLabel = (id: string): string => ({ about: t('about'), payouts: t('pendingPayouts'), comments: t('recentComments'), categories: t('secCategories'), archive: t('archive'), blogroll: t('blogroll') }[id] ?? id);
const missingBuiltin = computed(() => BUILTIN_PANELS.filter((id) => !panelsList.value.some((p) => p.id === id)));
const customCount = computed(() => panelsList.value.filter((p) => p.id === 'custom').length);
const addBuiltin = (id: string): void => { c.panels!.push({ id }); };
const addCustom = (): void => { c.panels!.push({ id: 'custom', title: '', text: '' }); };
function movePanel(i: number, d: number): void { const j = i + d, l = c.panels!; if (j < 0 || j >= l.length) return; const [x] = l.splice(i, 1); l.splice(j, 0, x); }
// categories
const uniqueId = (base: string, self: BlogCategory): string => {
  let id = base || 'cat'; let n = 2;
  while (c.cats.some((x) => x !== self && x.id === id)) id = `${base || 'cat'}-${n++}`;
  return id;
};
const addCat = (): void => { const x: BlogCategory = { id: '', name: '', desc: '', tags: [] }; x.id = uniqueId('cat', x); c.cats.push(x); };
const rename = (x: BlogCategory, v: string): void => { x.name = v; x.id = uniqueId(slug(v), x); };
function move(i: number, d: number): void { const j = i + d; if (j < 0 || j >= c.cats.length) return; const [x] = c.cats.splice(i, 1); c.cats.splice(j, 0, x); }
// accounts on the other chains (visitors see them; mirrored posts are looked up under these names)
const otherChains = CHAINS.filter((x) => x.id !== PRIMARY);
const accountOf = (id: string): string => c.accounts?.[id] ?? '';
function setAccount(id: string, v: string): void {
  const a = v.trim().toLowerCase().replace(/^@/, '');
  const next = { ...(c.accounts ?? {}) };
  if (a) next[id] = a; else delete next[id];
  c.accounts = Object.keys(next).length ? next : undefined;
}
const accountBad = (id: string): boolean => !!accountOf(id) && !normAccount(accountOf(id));
// recommended blogs
const addBlog = (): void => { (c.blogroll ??= []).push({ account: '', desc: '' }); };
// links
const addLink = (): void => { c.links.push({ label: '', url: 'https://' }); };

async function save(): Promise<void> {
  busy.value = true;
  c.links = c.links.filter((l) => l.label.trim() && safeUrl(l.url));
  c.pinned = normPermlink(c.pinned) || undefined;
  if (c.blogroll) { const seen = new Set<string>(); c.blogroll = c.blogroll.map((b) => ({ account: normAccount(b.account), desc: b.desc })).filter((b) => b.account && !seen.has(b.account) && seen.add(b.account)); if (!c.blogroll.length) c.blogroll = undefined; }
  if (c.accounts) { for (const k of Object.keys(c.accounts)) if (!normAccount(c.accounts[k])) delete c.accounts[k]; if (!Object.keys(c.accounts).length) c.accounts = undefined; }
  c.cats = c.cats.filter((x) => x.name.trim());
  try { await saveConfig(); saved = true; toast(t('saved')); navigate(href({})); }
  catch (e) { toast((e as Error).message); }
  busy.value = false;
}
const cancel = (): void => navigate(href({}));
const cfgUrl = `https://blurt.blog/@${USER}/${CONFIG_PERMLINK}`;
</script>

<template>
  <div v-if="!owner" class="article"><div class="art-in center">
    <p>{{ t('ownerOnly', { u: USER }) }}</p>
    <button v-if="!auth.me" class="pri" @click="loginOpen = true">{{ t('login') }}</button>
  </div></div>

  <div v-else class="settings">
    <h1>{{ t('setTitle') }}</h1>
    <p class="mute">{{ t('setIntro', { u: USER, p: CONFIG_PERMLINK }) }} <a :href="href({ view: 'docs' })" target="_blank">{{ t('howItWorks') }}</a></p>

    <section class="card form">
      <h3>{{ t('secGeneral') }}</h3>
      <label class="lbl">{{ t('fTitle') }}</label><input v-model="c.title" maxlength="80">
      <label class="lbl">{{ t('fSubtitle') }}</label><input v-model="c.subtitle" maxlength="160">
      <label class="lbl">{{ t('fAbout') }}</label><textarea v-model="c.about" rows="3" maxlength="600" />
      <label class="lbl">{{ t('fCover') }}</label><input v-model="c.cover" :class="{ bad: c.cover && !safeUrl(c.cover) }" placeholder="https://…">
      <label class="lbl">{{ t('fLogo') }}</label>
      <div class="logo-row"><input v-model="c.logo" :class="{ bad: c.logo && !safeUrl(c.logo) }" placeholder="https://…"><img v-if="safeUrl(c.logo)" class="logo-prev" :src="safeUrl(c.logo)" alt=""></div>
      <label class="lbl">{{ t('fLanguage') }}</label>
      <select class="sel wide" :value="c.language ?? ''" @change="c.language = ($event.target as HTMLSelectElement).value || undefined">
        <option value="">{{ t('langAuto') }}</option>
        <option v-for="l in LANGS" :key="l.code" :value="l.code">{{ l.label }}</option>
      </select>
      <label class="lbl">{{ t('fFooter') }}</label><input v-model="c.footer" maxlength="200">
      <label class="lbl">{{ t('fPinned') }}</label><input v-model="c.pinned" :class="{ bad: c.pinned && !normPermlink(c.pinned) }" :placeholder="t('pinnedPh')" autocapitalize="off">
      <div class="mute help">{{ t('pinnedHelp') }}</div>
    </section>

    <section class="card form">
      <h3>{{ t('secAppearance') }}</h3>
      <label class="lbl">{{ t('fPalette') }}</label>
      <div class="palettes">
        <button v-for="(p, k) in PALETTES" :key="k" class="pal" :class="{ on: (c.palette ?? 'default') === k }" @click="pickPalette(String(k))">
          <span class="sw"><i :style="{ background: p.light.bg }"><b :style="{ background: p.light.accent }" /></i><i :style="{ background: p.dark.bg }"><b :style="{ background: p.dark.accent }" /></i></span>
          {{ palLabel(String(k)) }}
        </button>
      </div>
      <div class="mute help">{{ t('themeNote') }}</div>
      <div class="colors">
        <div v-for="x in colors" :key="x.key" class="color">
          <label class="lbl">{{ t(x.label) }}</label>
          <div class="crow"><input type="color" :value="eff[x.key]" @input="setColor(x.key, ($event.target as HTMLInputElement).value)">
            <code>{{ eff[x.key] }}</code><button v-if="c[x.key]" class="small" @click="c[x.key] = undefined">{{ t('resetColor') }}</button></div>
        </div>
      </div>
      <label class="lbl">{{ t('fFont') }}</label>
      <select class="sel wide" :value="c.font ?? 'sans'" @change="c.font = ($event.target as HTMLSelectElement).value as typeof c.font">
        <option value="sans">{{ t('fontSans') }}</option><option value="serif">{{ t('fontSerif') }}</option><option value="mono">{{ t('fontMono') }}</option>
      </select>
      <label class="lbl">{{ t('fLayout') }}</label>
      <select class="sel wide" :value="c.layout ?? 'grid'" @change="c.layout = ($event.target as HTMLSelectElement).value as typeof c.layout">
        <option value="grid">{{ t('layoutGrid') }}</option><option value="list">{{ t('layoutList') }}</option>
      </select>
      <label class="lbl">{{ t('fSidebar') }}</label>
      <select class="sel wide" :value="c.sidebar ?? 'right'" @change="c.sidebar = ($event.target as HTMLSelectElement).value as typeof c.sidebar">
        <option value="right">{{ t('sideRight') }}</option><option value="left">{{ t('sideLeft') }}</option><option value="none">{{ t('sideNone') }}</option>
      </select>
    </section>

    <section class="card form">
      <h3>{{ t('secUi') }}</h3>
      <div class="mute help">{{ t('uiHelp') }}</div>
      <template v-for="(vals, k) in UI_OPTIONS" :key="k">
        <label class="lbl">{{ t('ui_' + k) }}</label>
        <select class="sel wide" :value="c.ui?.[k] ?? vals[0]" @change="setUi(String(k), ($event.target as HTMLSelectElement).value)">
          <option v-for="o in vals" :key="o" :value="o">{{ t('uiv_' + o) }}</option>
        </select>
      </template>
      <div><button class="small" :disabled="!c.ui || !Object.keys(c.ui).length" @click="c.ui = undefined">{{ t('uiReset') }}</button></div>
    </section>

    <section class="card form">
      <h3>{{ t('secPanels') }}</h3>
      <div class="mute help">{{ t('panelsHelp') }}</div>
      <div v-for="(p, i) in panelsList" :key="i" class="row-edit">
        <div class="cols one">
          <b v-if="p.id !== 'custom'">{{ panelLabel(p.id) }}</b>
          <template v-else>
            <input v-model="p.title" :placeholder="t('panelTitle')" maxlength="40">
            <textarea v-model="p.text" rows="3" maxlength="500" :placeholder="t('panelText')" />
          </template>
        </div>
        <div class="rbtn"><button class="small" :disabled="i === 0" @click="movePanel(i, -1)">↑</button><button class="small" :disabled="i === panelsList.length - 1" @click="movePanel(i, 1)">↓</button>
          <button class="small" :aria-label="t('remove')" :title="t('remove')" @click="c.panels!.splice(i, 1)">✕</button></div>
      </div>
      <div class="actions">
        <button v-for="id in missingBuiltin" :key="id" @click="addBuiltin(id)">+ {{ panelLabel(id) }}</button>
        <button :disabled="customCount >= MAX_CUSTOM_PANELS" @click="addCustom">+ {{ t('addPanel') }}</button>
      </div>
      <!-- the real sidebar is hidden on this page, so show how it will look -->
      <label class="lbl">{{ t('tabPreview') }}</label>
      <div class="panel-preview"><SideBar /></div>
    </section>

    <section class="card form">
      <h3>{{ t('secCategories') }}</h3>
      <div class="mute help">{{ t('catsHelp') }}</div>
      <div v-for="(x, i) in c.cats" :key="i" class="row-edit">
        <div class="cols">
          <input :value="x.name" :placeholder="t('catName')" maxlength="40" @input="rename(x, ($event.target as HTMLInputElement).value)">
          <input :value="x.tags.join(', ')" :placeholder="t('catTags')" @change="x.tags = parseTags(($event.target as HTMLInputElement).value)">
          <input v-model="x.desc" :placeholder="t('catDesc')" maxlength="120">
        </div>
        <div class="rbtn"><button class="small" :disabled="i === 0" @click="move(i, -1)">↑</button><button class="small" :disabled="i === c.cats.length - 1" @click="move(i, 1)">↓</button>
          <button class="small" :aria-label="t('remove')" :title="t('remove')" @click="c.cats.splice(i, 1)">✕</button></div>
      </div>
      <button @click="addCat">+ {{ t('addCat') }}</button>
    </section>

    <section class="card form">
      <h3>{{ t('cfgChains') }}</h3>
      <div class="mute help">{{ t('cfgChainsHelp') }}</div>
      <template v-for="x in otherChains" :key="x.id">
        <label class="lbl">{{ x.name }}</label>
        <input :value="accountOf(x.id)" :class="{ bad: accountBad(x.id) }" :placeholder="t('cfgChainPh', { c: x.name })" autocapitalize="off" @input="setAccount(x.id, ($event.target as HTMLInputElement).value)">
      </template>
    </section>

    <section class="card form">
      <h3>{{ t('blogroll') }}</h3>
      <div class="mute help">{{ t('blogrollHelp') }}</div>
      <div v-for="(b, i) in c.blogroll ?? []" :key="i" class="row-edit">
        <div class="cols two"><input v-model="b.account" :class="{ bad: b.account && !normAccount(b.account) }" :placeholder="t('blogAccount')" autocapitalize="off" maxlength="17"><input v-model="b.desc" :placeholder="t('blogDesc')" maxlength="80"></div>
        <div class="rbtn"><button class="small" :aria-label="t('remove')" :title="t('remove')" @click="c.blogroll!.splice(i, 1)">✕</button></div>
      </div>
      <button :disabled="(c.blogroll?.length ?? 0) >= MAX_BLOGROLL" @click="addBlog">+ {{ t('addBlog') }}</button>
    </section>

    <section class="card form">
      <h3>{{ t('secLinks') }}</h3>
      <div v-for="(l, i) in c.links" :key="i" class="row-edit">
        <div class="cols two"><input v-model="l.label" :placeholder="t('catName')" maxlength="40"><input v-model="l.url" :class="{ bad: l.url && !safeUrl(l.url) }" :placeholder="t('linkUrl')"></div>
        <div class="rbtn"><button class="small" :aria-label="t('remove')" :title="t('remove')" @click="c.links.splice(i, 1)">✕</button></div>
      </div>
      <button @click="addLink">+ {{ t('addLink') }}</button>
    </section>

    <div class="savebar">
      <button class="pri" :disabled="busy" @click="save">{{ busy ? t('saving') : t('save') }}</button>
      <button :disabled="busy" @click="cancel">{{ t('cancel') }}</button>
      <a class="mute" :href="cfgUrl" target="_blank" rel="noopener">{{ t('viewConfigPost') }}</a>
    </div>
  </div>
</template>
