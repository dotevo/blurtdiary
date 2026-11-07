<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../lib/i18n';
import { fmtDate } from '../lib/util';
import { htmlToMarkdown, importedLocal, isHttpUrl, loadFeed, normSource, sourceFooter, tagsFrom, type Feed, type FeedItem } from '../lib/rss';
import { href, navigate, postParam, state, USER } from '../lib/store';
import { meta } from '../lib/util';
import { rssFooter, setRssFooter } from '../lib/settings';

/** Second mode of the editor: pick a post from an RSS/Atom feed; "Import" fills the editor as if the post had been written here. */
const emit = defineEmits<{ import: [p: { title: string; body: string; tags: string; source: string }] }>();
const LK = 'bd-rss-urls';
const recent = ref<string[]>([]);
try { recent.value = (JSON.parse(localStorage.getItem(LK) ?? '[]') as unknown[]).filter((x): x is string => typeof x === 'string' && isHttpUrl(x)).slice(0, 5); } catch { /* ignore */ }
const url = ref(recent.value[0] ?? '');
/** Already imported: marked on the chain (`rss_source` in the metadata of the blog's loaded posts) or remembered by this browser. */
const doneMap = computed(() => {
  const m = new Map<string, string>(Object.entries(importedLocal()));
  for (const p of state.posts) { const s = meta(p).rss_source; if (typeof s === 'string') m.set(normSource(s), p.permlink); }
  return m;
});
const doneOf = (it: FeedItem): string | undefined => (it.link ? doneMap.value.get(normSource(it.link)) : undefined);
const feed = ref<Feed | null>(null); const busy = ref(false); const err = ref('');

async function load(): Promise<void> {
  const u = url.value.trim();
  err.value = ''; feed.value = null;
  if (!isHttpUrl(u)) { err.value = t('rssBadUrl'); return; }
  busy.value = true;
  try {
    feed.value = await loadFeed(u);
    recent.value = [u, ...recent.value.filter((x) => x !== u)].slice(0, 5);
    try { localStorage.setItem(LK, JSON.stringify(recent.value)); } catch { /* ignore */ }
  } catch (e) { err.value = t('rssError', { e: (e as Error).message }); }
  busy.value = false;
}
function pick(it: FeedItem): void {
  const f = feed.value; if (!f) return;
  let body = htmlToMarkdown(it.html, it.link);
  if (rssFooter.value) body += sourceFooter(f.title, it.link, it.partial);
  emit('import', { title: it.title.slice(0, 255), body, tags: tagsFrom(it.tags), source: it.link });
}
</script>
<template>
  <div class="import">
    <div class="mute help">{{ t('rssHelp') }}</div>
    <div class="imp-row">
      <input v-model="url" type="url" inputmode="url" :placeholder="t('rssUrlPh')" autocapitalize="off" list="rss-recent" @keydown.enter="load">
      <datalist id="rss-recent"><option v-for="r in recent" :key="r" :value="r" /></datalist>
      <button class="pri" :disabled="busy || !url.trim()" @click="load">{{ busy ? t('rssLoading') : t('rssLoad') }}</button>
    </div>
    <label class="imp-footer"><input type="checkbox" :checked="rssFooter" @change="setRssFooter(($event.target as HTMLInputElement).checked)"> {{ t('rssFooterToggle') }}</label>
    <div v-if="err" class="badtxt help">{{ err }}</div>
    <template v-if="feed">
      <div class="mute help"><b>{{ feed.title || url }}</b> · {{ t('rssCount', { n: feed.items.length }) }}</div>
      <div v-if="!feed.items.length" class="mute">{{ t('rssEmpty') }}</div>
      <div v-for="(it, i) in feed.items" :key="i" class="imp-item" :class="{ done: doneOf(it) }">
        <div class="imp-main">
          <b>{{ it.title || t('rssUntitled') }}</b>
          <div class="mute help">{{ it.date ? fmtDate(it.date) : '' }} · {{ it.partial ? t('rssPartial') : t('rssFull') }}
            <template v-if="doneOf(it)"> · <a class="imp-badge" :href="href({ post: postParam(USER, doneOf(it) as string) })" @click.prevent="navigate(href({ post: postParam(USER, doneOf(it) as string) }))">✓ {{ t('rssDone') }}</a></template></div>
          <div class="mute">{{ it.excerpt }}</div>
        </div>
        <button :class="{ pri: !doneOf(it) }" @click="pick(it)">{{ doneOf(it) ? t('rssImportAgain') : t('rssImport') }}</button>
      </div>
    </template>
  </div>
</template>
