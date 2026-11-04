import { reactive, computed } from 'vue';
import { rpc } from './rpc';
import { CONFIG_PERMLINK, emptyConfig, normAccount, parseConfig } from './config';
import { rootOf, slug, tagsOf } from './util';
import { applyTheme } from './theme';
import { touchFav } from './favs';
import { coalMap, coalReady } from './coal';
import { LANGS, langSaved, loadLanguage, t, type Lang } from './i18n';
import type { BlogCategory, BlogConfig, Post, Profile } from './types';

const PAGE = 20;
const q = new URLSearchParams(location.search);
// the account name goes into URLs, storage keys and RPC calls: anything that is not a valid account name is ignored
export const USER = normAccount(q.get('user') ?? '');
if (USER) { try { localStorage.setItem('bd-last-user', USER); } catch { /* ignore */ } } // used by the installed app (PWA) to reopen the last blog
// ?recent=auto|replies|own|scan lets you try each "recent comments" strategy in the browser.
export const RECENT_MODE = q.get('recent') ?? 'auto';

export const state = reactive({
  loading: true, error: '',
  profile: null as Profile | null,
  cfg: emptyConfig() as BlogConfig,
  configPost: null as { parent_permlink: string } | null, // set when @user/blurt-diary-config exists (edit instead of create)
  posts: [] as Post[], more: true, loadingMore: false, busy: false,
  recent: [] as Post[],
  cat: q.get('cat') ?? '', post: q.get('post') ?? '', focus: q.get('c') ?? '', view: q.get('view') ?? '',
  searchBroken: false, // bridge.search_posts unavailable -> fall back to scanning the latest posts
});

// ---------- URLs ----------
export const href = (o: { cat?: string; post?: string; c?: string; view?: 'write' | 'settings' | 'docs' | 'feed' }): string => {
  const p = new URLSearchParams();
  if (USER) p.set('user', USER); // the documentation also works without a user
  if (o.cat) p.set('cat', o.cat);
  if (o.post) p.set('post', o.post);
  if (o.c) p.set('c', o.c);
  if (o.view) p.set('view', o.view);
  if (RECENT_MODE !== 'auto') p.set('recent', RECENT_MODE);
  return '?' + p;
};
/** `post` param = "permlink" (post of USER) or "author/permlink" (someone else's). */
export const postParam = (author: string, permlink: string): string => (author === USER ? permlink : `${author}/${permlink}`);
export const postRef = (p: string): { author: string; permlink: string } => {
  const [a, b] = p.includes('/') ? p.replace(/^@/, '').split('/') : [USER, p];
  return { author: a, permlink: b };
};
export const keyOf = (p: Post): string => `${p.author}/${p.permlink}`;
/** Link to the root post of a comment, with ?c= so the page scrolls to and highlights that comment. */
export const commentHref = (c: Post): string => {
  const r = rootOf(c);
  return r ? href({ post: postParam(r.author, r.permlink), c: keyOf(c) }) : '';
};

function syncFromUrl(): void {
  const p = new URLSearchParams(location.search);
  state.cat = p.get('cat') ?? ''; state.post = p.get('post') ?? ''; state.focus = p.get('c') ?? ''; state.view = p.get('view') ?? '';
}
export function navigate(h: string, replace = false): void {
  if (replace) history.replaceState({}, '', h); else history.pushState({}, '', h);
  syncFromUrl();
  if (!replace) window.scrollTo(0, 0);
  if (!state.post && !state.view) void ensureEnough();
}
window.addEventListener('popstate', () => { syncFromUrl(); if (!state.post && !state.view) void ensureEnough(); });

const isConfigPost = (p: Post): boolean => p.author === USER && p.permlink === CONFIG_PERMLINK;

// ---------- categories ----------
// Preferred: bridge.search_posts {author, tag, offset} (server-side filter). Results are ALWAYS re-checked in the
// browser (author + tag), so it stays correct even if a node ignores a parameter. If the method is missing on every
// node we fall back to scanning the latest posts of the account.
interface Bucket { posts: Post[]; offsets: Record<string, number>; done: Record<string, boolean> }
const buckets = reactive<Record<string, Bucket>>({});
const currentCat = (): BlogCategory | undefined => state.cfg.cats.find((x) => x.id === state.cat);

async function catRound(c: BlogCategory): Promise<void> {
  // NB: `x ||= v` would hand back the RAW object (no reactivity); re-read through the reactive proxy instead
  if (!buckets[c.id]) buckets[c.id] = { posts: [], offsets: {}, done: {} };
  const b = buckets[c.id];
  await Promise.all(c.tags.filter((t) => !b.done[t]).map(async (tag) => {
    const offset = b.offsets[tag] ?? 0;
    const r = await rpc<{ posts?: Post[]; total?: number } | Post[]>('bridge', 'search_posts', { author: USER, tag, limit: PAGE, offset });
    const raw = Array.isArray(r) ? r : (r.posts ?? []);
    const total = Array.isArray(r) ? undefined : r.total;
    b.offsets[tag] = offset + raw.length;
    if (raw.length < PAGE || (total != null && b.offsets[tag] >= total)) b.done[tag] = true;
    for (const p of raw) if (!isConfigPost(p) && p.author === USER && tagsOf(p).includes(tag) && !b.posts.some((x) => x.permlink === p.permlink)) b.posts.push(p);
  }));
  b.posts.sort((x, y) => y.created.localeCompare(x.created));
}

export const visible = computed(() => {
  const c = currentCat();
  if (!c) return state.posts;
  if (!state.searchBroken) return buckets[c.id]?.posts ?? [];
  return state.posts.filter((p) => tagsOf(p).some((t) => c.tags.includes(t)));
});
export const canMore = computed(() => {
  const c = currentCat();
  if (!c || state.searchBroken) return state.more;
  return c.tags.some((t) => !buckets[c.id]?.done[t]);
});

// ---------- loading ----------
async function loadProfile(): Promise<void> {
  // the settings post is looked up in parallel with the account (fixed permlink, so no profile link is needed)
  const [accs, own] = await Promise.all([
    rpc<Record<string, string>[]>('condenser_api', 'get_accounts', [[USER]]),
    rpc<Post>('condenser_api', 'get_content', [USER, CONFIG_PERMLINK]).catch(() => null),
  ]);
  const acc = accs[0];
  if (!acc) throw new Error(t('accountNotFound', { u: USER }));
  let prof: Profile = {};
  try { prof = JSON.parse(acc.posting_json_metadata || acc.json_metadata || '{}').profile ?? {}; } catch { /* ignore */ }
  state.profile = prof;
  if (own?.author && own.body) {
    state.cfg = parseConfig(own.body);
    state.configPost = { parent_permlink: own.parent_permlink || 'blurt-diary' };
  } else {
    // fallback: link to any post in the profile (diary_config / blog_config) or [[Diary config:author/permlink]] in `about`
    const link = prof.diary_config ?? prof.blog_config ?? String(prof.about ?? '').match(/\[\[(?:Diary|Blog) config:@?([a-z0-9.-]+\/[a-z0-9-]+)\]\]/i)?.[1];
    if (link) {
      try {
        const [a, pl] = link.replace(/^@/, '').split('/');
        const post = await rpc<Post>('condenser_api', 'get_content', [a, pl]);
        if (post?.body) state.cfg = parseConfig(post.body);
      } catch (e) { console.warn('blog config load failed', e); }
    }
  }
  document.title = (state.cfg.title ?? prof.name ?? '@' + USER) + ' – Blurt Diary';
  touchFav(USER, state.cfg.title ?? prof.name);
  applyTheme(state.cfg);
  const dl = state.cfg.language as Lang | undefined; // the blog's default language applies only until the visitor picks their own
  if (dl && !langSaved() && LANGS.some((l) => l.code === dl)) await loadLanguage(dl);
}

async function fetchPage(limit: number): Promise<void> {
  if (state.loadingMore || !state.more) return;
  state.loadingMore = true;
  try {
    const last = state.posts[state.posts.length - 1];
    const p: Record<string, unknown> = { sort: 'posts', account: USER, limit };
    if (last) { p.start_author = last.author; p.start_permlink = last.permlink; }
    let res = await rpc<Post[]>('bridge', 'get_account_posts', p);
    if (last) res = res.filter((x) => x.permlink !== last.permlink);
    state.posts.push(...res.filter((x) => !isConfigPost(x)));
    if (res.length < limit - 1) state.more = false;
  } catch (e) {
    if (!state.posts.length) throw e; // first page failing = show the error
    state.more = false;
  } finally { state.loadingMore = false; }
}
export const fetchPosts = (): Promise<void> => fetchPage(PAGE);

async function scanEnough(): Promise<void> { // fallback: at most 3 pages per step
  for (let i = 0; i < 3 && state.more && visible.value.length < 9; i++) await fetchPage(PAGE);
}
export async function ensureEnough(): Promise<void> {
  const c = currentCat();
  if (c && !state.searchBroken) {
    try { for (let i = 0; i < 3 && canMore.value && visible.value.length < 9; i++) await catRound(c); return; }
    catch (e) { console.warn('search_posts failed, falling back to scanning', e); state.searchBroken = true; }
  }
  await scanEnough();
}
export async function loadMore(): Promise<void> {
  state.busy = true;
  try {
    const c = currentCat();
    if (c && !state.searchBroken) {
      try { await catRound(c); return; } catch (e) { console.warn('search_posts failed', e); state.searchBroken = true; }
    }
    const before = visible.value.length;
    for (let i = 0; i < (c ? 3 : 1) && state.more; i++) {
      await fetchPage(PAGE);
      if (visible.value.length - before >= 9) break;
    }
  } finally { state.busy = false; }
}

function autoCats(): void { // no config post → categories from the most used tags
  if (state.cfg.cats.length) return;
  const cnt: Record<string, number> = {};
  state.posts.forEach((p) => tagsOf(p).forEach((t) => { cnt[t] = (cnt[t] ?? 0) + 1; }));
  state.cfg.cats = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([t]) => ({ id: slug(t), name: '#' + t, desc: '', tags: [t] }));
}

// ---------- recent comments (only threads rooted in the user's own posts, never COAL authors) ----------
const notCoal = (c: Post): boolean => !coalMap.value.has(c.author.toLowerCase());

export async function loadRecent(): Promise<void> {
  await coalReady;
  const attempt = async (m: string): Promise<Post[]> => {
    if (m === 'replies') {
      const out: Post[] = []; let last: Post | undefined;
      for (let i = 0; i < 3 && out.length < 10; i++) {
        const prm: Record<string, unknown> = { sort: 'replies', account: USER, limit: 30 };
        if (last) { prm.start_author = last.author; prm.start_permlink = last.permlink; }
        let res = await rpc<Post[]>('bridge', 'get_account_posts', prm);
        if (last) res = res.filter((x) => x.permlink !== last!.permlink);
        if (!res.length) break;
        out.push(...res.filter((c) => rootOf(c)?.author === USER && notCoal(c)));
        last = res[res.length - 1];
      }
      return out.slice(0, 12);
    }
    if (m === 'own') return rpc<Post[]>('bridge', 'get_account_posts', { sort: 'comments', account: USER, limit: 12 });
    const rs = await Promise.all(state.posts.slice(0, 8).map((p) =>
      rpc<Post[]>('condenser_api', 'get_content_replies', [p.author, p.permlink]).catch(() => [] as Post[])));
    return rs.flat().sort((a, b) => b.created.localeCompare(a.created)).slice(0, 12);
  };
  for (const m of RECENT_MODE === 'auto' ? ['replies', 'scan'] : [RECENT_MODE]) {
    try { const l = (await attempt(m)).filter(notCoal); if (l.length) { state.recent = l; return; } } catch (e) { console.warn('recent', m, e); }
  }
}

export async function initBlog(): Promise<void> {
  if (!USER) { state.loading = false; return; }
  try {
    await loadProfile(); await fetchPosts(); autoCats(); await ensureEnough();
    void loadRecent();
  } catch (e) { state.error = (e as Error).message; }
  state.loading = false;
}
