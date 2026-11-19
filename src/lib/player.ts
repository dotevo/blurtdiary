/**
 * The media player: hidden until the reader presses a ▶ chip next to a YouTube / Suno / blurt.media / audio link (or a logged-in user
 * slides it out from the account menu). One track plays at a time. Next track: the manual queue first, then the other media links of
 * the post it came from (play mode: in order / shuffle / repeat all / repeat one). Playlists, queue and history live in this browser.
 * No third-party SCRIPT is ever loaded (every blog shares one origin that holds the keys): YouTube and Suno are driven through the
 * documented postMessage protocol of their embed pages, the PeerTube embed API is a vendored same-origin file loaded on first use.
 */
import { computed, reactive, watch } from 'vue';
import { auth } from './auth';
import { coverOf, detectMedia, mediaLabel, PROXY_BASE, SUNO_EMBED_BASE, type MediaRef } from './media';
import { t } from './i18n';
import { toast } from './toast';

export interface Track extends MediaRef { key: string; title: string; sponsored?: { id: string; sec: number } }
export type PlayMode = 'sequential' | 'shuffle' | 'repeat-all' | 'repeat-one';
export interface Playlist { id: string; name: string; tracks: Track[]; updatedAt: number }

const rd = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const wr = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const load = <T>(k: string, fallback: T): T => { try { const v = JSON.parse(rd(k) ?? 'null'); return v ?? fallback; } catch { return fallback; } };
const MODES: PlayMode[] = ['sequential', 'shuffle', 'repeat-all', 'repeat-one'];
/** Stored tracks come from localStorage, which any script on this origin could edit: they are rebuilt from validated media links only. */
const clean = (x: any): Track | null => {
  if (!x || typeof x !== 'object') return null;
  const ref = detectMedia(x.type === 'audio' ? String(x.src ?? '') : x.type === 'youtube' ? `https://youtu.be/${x.id}` : x.type === 'suno' ? `https://suno.com/${x.pending ? 's' : 'song'}/${x.id}` : `https://${x.host}/w/${x.id}`);
  if (!ref || ref.type !== x.type) return null;
  return { ...ref, key: `${ref.type}:${ref.id}`, title: String(x.title ?? '').slice(0, 200) || mediaLabel(ref) };
};
const cleanList = (a: unknown): Track[] => (Array.isArray(a) ? a.map(clean).filter((x): x is Track => !!x) : []);

export const pl = reactive({
  pinned: rd('bd-player-pinned') === '1', // the logged-in user slid the player out from the menu
  current: null as Track | null,
  auto: [] as Track[], // the media links of the post the current track came from
  queue: cleanList(load('bd-player-queue', [])), // "Up next": added by the user, played before anything else
  history: cleanList(load('bd-player-history', [])),
  mode: ((): PlayMode => { const m = rd('bd-player-mode') as PlayMode; return MODES.includes(m) ? m : 'sequential'; })(),
  playing: false, loading: false, error: '',
  time: 0, duration: 0, volume: Math.min(1, Math.max(0, parseFloat(rd('bd-player-volume') ?? '0.8') || 0.8)),
  expanded: false, tab: 'queue' as 'queue' | 'lists',
  nonce: 0, // a new value re-creates the iframe (pressing ▶ on the same track again restarts it)
});
const asked = new Set<string>();
/** Cover/title found by a lookup (PeerTube), by track key. */
export const meta = reactive<Record<string, { cover?: string; title?: string }>>({});
export const trackCover = (tr: Track | null): string => (tr ? coverOf(tr) || meta[tr.key]?.cover || '' : '');
export const lists = reactive<{ items: Playlist[] }>({ items: ((): Playlist[] => { const a = load<any[]>('bd-player-playlists', []); return (Array.isArray(a) ? a : []).map((p) => ({ id: String(p.id ?? Math.random()), name: String(p.name ?? '').slice(0, 60) || '—', updatedAt: +p.updatedAt || 0, tracks: cleanList(p.tracks) })); })() });
watch(() => pl.queue, (v) => wr('bd-player-queue', JSON.stringify(v)), { deep: true });
watch(() => pl.history, (v) => wr('bd-player-history', JSON.stringify(v)), { deep: true });
watch(() => lists.items, (v) => wr('bd-player-playlists', JSON.stringify(v)), { deep: true });

/** Shown only while something is loaded, or when a logged-in user asked for it. */
export const dockVisible = computed(() => !!pl.current || (pl.pinned && !!auth.me));
watch(dockVisible, (v) => document.body.classList.toggle('has-player', v), { immediate: true }); // lifts the floating job button above the dock
export const hasVideo = computed(() => !!pl.current && pl.current.type !== 'audio');

export const frameSrc = (tr: Track | null): string => {
  if (!tr || tr.pending) return '';
  if (tr.type === 'youtube') return `https://www.youtube-nocookie.com/embed/${tr.id}?enablejsapi=1&autoplay=1&rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}`;
  if (tr.type === 'peertube') return `https://${tr.host}/videos/embed/${tr.id}?api=1&autoplay=1`;
  if (tr.type === 'suno') return `${SUNO_EMBED_BASE}/${tr.id}?autoplay=1`;
  return '';
};

// ─── engines ───────────────────────────────────────────────────────────────
let gen = 0; // bumped on every track change: late events of the previous track are ignored
let frame: HTMLIFrameElement | null = null;
let audio: HTMLAudioElement | null = null;
let pt: any = null; // PeerTube embed API object
let adTimer: ReturnType<typeof setTimeout> | null = null;
const YT_ORIGIN = 'https://www.youtube-nocookie.com';
const SUNO_ORIGIN = ((): string => { try { return new URL(SUNO_EMBED_BASE).origin; } catch { return ''; } })();
const ytCmd = (func: string, args: unknown[] = []): void => { frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN); };
const sunoCmd = (action: string, extra: Record<string, unknown> = {}): void => { frame?.contentWindow?.postMessage({ action, ...extra }, SUNO_ORIGIN); };

function stopEngines(): void {
  gen++;
  if (adTimer) { clearTimeout(adTimer); adTimer = null; }
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  pt = null; frame = null;
  pl.playing = false; pl.loading = false; pl.time = 0; pl.duration = 0;
}
const fail = (code: string): void => { pl.error = code; pl.playing = false; pl.loading = false; };

function startAudio(tr: Track): void {
  const g = gen;
  audio ??= new Audio();
  audio.preload = 'auto'; audio.volume = pl.volume;
  audio.onplaying = () => { if (g === gen) { pl.playing = true; pl.loading = false; } };
  audio.onpause = () => { if (g === gen) pl.playing = false; };
  audio.onwaiting = () => { if (g === gen) pl.loading = true; };
  audio.ontimeupdate = () => { if (g === gen && audio) { pl.time = audio.currentTime; pl.duration = isFinite(audio.duration) ? audio.duration : 0; } };
  audio.onended = () => { if (g === gen) next(true); };
  audio.onerror = () => { if (g === gen) fail('playerError'); };
  audio.src = tr.src ?? '';
  void audio.play().catch(() => { if (g === gen) fail('playerError'); });
}

let ptLoading: Promise<void> | null = null;
const loadPT = (): Promise<void> => {
  if ((window as any).PeerTubePlayer) return Promise.resolve();
  return (ptLoading ??= new Promise<void>((ok, bad) => {
    const s = document.createElement('script');
    s.src = `${import.meta.env.BASE_URL}vendor/peertube-embed-api/player.min.js`; // our own copy, never a CDN
    s.onload = () => ok(); s.onerror = () => { ptLoading = null; bad(new Error('peertube sdk')); };
    document.head.append(s);
  }));
};

/** Called by the dock when the iframe of the current track has loaded. */
export function frameLoaded(el: HTMLIFrameElement): void {
  const tr = pl.current; if (!tr || tr.type === 'audio') return;
  frame = el; const g = gen;
  if (tr.type === 'youtube') {
    // "listening" makes the embed report time/state; it is only honoured once the page inside has booted, so it is repeated a few times
    const hello = (): void => { if (g === gen) frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'bd', channel: 'widget' }), YT_ORIGIN); };
    hello(); setTimeout(hello, 600); setTimeout(hello, 1800);
    pl.loading = false;
  } else if (tr.type === 'suno') {
    pl.loading = false; setTimeout(() => { if (g === gen) { sunoCmd('setVolume', { volume: pl.volume }); sunoCmd('play'); } }, 400);
  } else if (tr.type === 'peertube') {
    loadPT().then(() => {
      if (g !== gen) return;
      pt = new (window as any).PeerTubePlayer(el);
      pt.ready.then(() => {
        if (g !== gen) return;
        pl.loading = false; void pt.setVolume(pl.volume); void pt.play();
        pt.addEventListener('playbackStatusUpdate', (s: any) => {
          if (g !== gen || !s) return;
          if (s.duration > 0) { pl.duration = s.duration; pl.time = s.position ?? 0; }
          if (s.playbackState === 'ended') next(true);
        });
        pt.addEventListener('playbackStatusChange', (st: string) => { if (g === gen) pl.playing = st === 'playing'; });
      });
    }).catch(() => { if (g === gen) fail('playerError'); });
  }
}

window.addEventListener('message', (e: MessageEvent) => {
  const tr = pl.current; if (!tr) return;
  if (tr.type === 'youtube' && e.origin === YT_ORIGIN && e.source === frame?.contentWindow) {
    let d: any = e.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || typeof d !== 'object') return;
    if (d.event === 'onError') { fail('playerError'); return; }
    const info = d.event === 'infoDelivery' ? d.info : d.event === 'onStateChange' ? { playerState: d.info } : null;
    if (!info) return;
    if (typeof info.currentTime === 'number') pl.time = info.currentTime;
    if (typeof info.duration === 'number' && info.duration > 0) pl.duration = info.duration;
    if (typeof info.playerState === 'number') {
      const s = info.playerState; pl.loading = s === 3;
      if (s === 1) pl.playing = true; else if (s === 2) pl.playing = false;
      else if (s === 0) { pl.playing = false; next(true); }
    }
  } else if (tr.type === 'suno' && e.origin === SUNO_ORIGIN && e.source === frame?.contentWindow) {
    const m: any = e.data; if (!m || m.source !== 'suno-embed') return;
    if ((m.type === 'init' || m.type === 'ready') && m.duration > 0) pl.duration = m.duration;
    else if (m.type === 'play') { pl.playing = true; pl.loading = false; }
    else if (m.type === 'pause') pl.playing = false;
    else if (m.type === 'ended') { pl.playing = false; next(true); }
    else if (m.type === 'timeupdate' && m.duration > 0) { pl.duration = m.duration; pl.time = m.currentTime; }
  }
});

// ─── metadata that needs a lookup ──────────────────────────────────────────
/** Reads a page through our worker (the browser may not read suno.com or other sites directly). */
const viaProxy = async (url: string): Promise<Response> => fetch(`${PROXY_BASE}?url=${encodeURIComponent(url)}`);
const sunoIds = new Map<string, string>(); // short share id -> song id (resolved once per visit)
async function resolveSuno(tr: Track): Promise<void> {
  const g = gen;
  try {
    const uuid = sunoIds.get(tr.id) ?? (await (await viaProxy(`https://suno.com/s/${tr.id}`)).text()).match(/song\/([a-f0-9-]{36})/i)?.[1];
    if (uuid) sunoIds.set(tr.id, uuid);
    if (g !== gen) return;
    if (!uuid) { fail('playerError'); return; }
    const c = pl.current; if (c?.key === tr.key) { c.id = uuid; c.pending = false; } // (the reactive copy) the dock creates the iframe as soon as the id is real
    pl.loading = false;
  } catch { if (g === gen) fail('playerError'); }
}
/** YouTube title through our worker (oEmbed is not readable from the browser directly). */
export async function youtubeMeta(id: string): Promise<void> {
  const key = `youtube:${id}`; if (asked.has(key)) return; asked.add(key);
  try {
    const j = await (await viaProxy(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://youtu.be/${id}`)}`)).json();
    if (typeof j.title === 'string' && j.title) { meta[key] = { title: j.title.slice(0, 200) }; const c = pl.current; if (c?.key === key && c.title === mediaLabel(c)) c.title = meta[key].title as string; }
  } catch { asked.delete(key); /* a nicety only */ }
}
/** PeerTube title + thumbnail (one lookup per video, cached; the page that shows the card asks too). */
export async function peertubeMeta(host: string, id: string): Promise<void> {
  const key = `peertube:${id}`; if (asked.has(key)) return; asked.add(key);
  const url = `https://${host}/api/v1/videos/${encodeURIComponent(id)}`;
  try {
    let r = await fetch(url).catch(() => null); if (!r?.ok) r = await viaProxy(url);
    const j = await r.json(); const path = j.thumbnailPath || j.previewPath;
    meta[key] = { title: typeof j.name === 'string' ? j.name.slice(0, 200) : undefined, cover: typeof path === 'string' && /^\/[\w./-]+$/.test(path) ? `https://${host}${path}` : undefined };
    const c = pl.current; if (c?.key === key && meta[key].title && c.title === mediaLabel(c)) c.title = meta[key].title as string;
  } catch { asked.delete(key); /* a nicety only */ }
}

// ─── sponsored tracks (see sponsored.ts) ───────────────────────────────────
/** Called on every advance with the track being left; may return a sponsored track to play next. */
let sponsorHook: ((leaving: Track | null) => Track | null) | null = null;
export const setSponsorHook = (f: (leaving: Track | null) => Track | null): void => { sponsorHook = f; };

// ─── controls ──────────────────────────────────────────────────────────────
function playTrack(tr: Track): void {
  stopEngines(); pl.error = ''; pl.nonce++; pl.current = tr; pl.loading = true;
  if (tr.type === 'audio') startAudio(tr);
  else if (tr.type === 'suno' && tr.pending) void resolveSuno(tr);
  else if (tr.type === 'peertube') void peertubeMeta(tr.host ?? '', tr.id);
  else if (tr.type === 'youtube') void youtubeMeta(tr.id);
  const known = meta[tr.key]?.title; if (known && tr.title === mediaLabel(tr)) tr.title = known;
  if (tr.sponsored) { const g = gen; adTimer = setTimeout(() => { if (g === gen) next(true); }, tr.sponsored.sec * 1000); } // an ad is cut after its paid seconds (the reader can skip any time)
}
const remember = (leaving: Track | null): void => { if (leaving && !leaving.sponsored) { pl.history.push({ ...leaving }); if (pl.history.length > 50) pl.history.splice(0, pl.history.length - 50); } };

/** Starts a track from a post: the post's other media links become the "auto" queue. */
export function playFromPost(tracks: Track[], at: number): void {
  if (!tracks.length) return;
  remember(pl.current); pl.auto = tracks; playTrack(tracks[Math.min(Math.max(at, 0), tracks.length - 1)]);
  void import('./sponsored').then((m) => m.initSponsored());
}
export function playNow(tr: Track): void { remember(pl.current); pl.auto = []; playTrack({ ...tr }); }
export function next(auto = false): void {
  const leaving = pl.current;
  const ad = sponsorHook?.(leaving) ?? null;
  if (auto && pl.mode === 'repeat-one' && leaving && !leaving.sponsored) { playTrack(leaving); return; }
  if (ad) { remember(leaving); playTrack(ad); return; }
  const key = (x: Track): string => x.key;
  if (pl.queue.length) { remember(leaving); playTrack(pl.queue.shift() as Track); return; }
  if (pl.auto.length) {
    // after an ad the position in the list is the one of the track before it, so the track we return to is looked up by the history
    const base = leaving?.sponsored ? pl.history[pl.history.length - 1] ?? null : leaving;
    const i = base ? pl.auto.findIndex((x) => key(x) === key(base)) : -1;
    let nx: Track | null = null;
    if (pl.mode === 'shuffle') { const rest = pl.auto.filter((x) => !base || key(x) !== key(base)); nx = rest.length ? rest[Math.floor(Math.random() * rest.length)] : null; }
    else if (i >= 0 && i < pl.auto.length - 1) nx = pl.auto[i + 1];
    else if (pl.mode === 'repeat-all' || i < 0) nx = pl.auto[0];
    if (nx) { remember(leaving); playTrack({ ...nx }); return; }
  }
  if (auto) { pl.playing = false; pl.loading = false; } // end of everything: stay on the finished track
}
export function prev(): void {
  if (pl.time > 4) { seek(0); return; }
  const h = pl.history.pop(); if (h) { playTrack(h); return; }
  const i = pl.current ? pl.auto.findIndex((x) => x.key === pl.current?.key) : -1;
  if (i > 0) playTrack({ ...pl.auto[i - 1] }); else seek(0);
}
export function toggle(): void {
  const tr = pl.current; if (!tr) return;
  if (pl.error) { playTrack(tr); return; }
  if (tr.type === 'audio') { if (audio?.paused) void audio.play(); else audio?.pause(); }
  else if (tr.type === 'youtube') ytCmd(pl.playing ? 'pauseVideo' : 'playVideo');
  else if (tr.type === 'suno') sunoCmd(pl.playing ? 'pause' : 'play');
  else if (tr.type === 'peertube' && pt) { if (pl.playing) void pt.pause(); else void pt.play(); }
}
export function seek(sec: number): void {
  const tr = pl.current; if (!tr || !(sec >= 0)) return;
  pl.time = sec;
  if (tr.type === 'audio' && audio) audio.currentTime = sec;
  else if (tr.type === 'youtube') ytCmd('seekTo', [sec, true]);
  else if (tr.type === 'suno') sunoCmd('seek', { time: sec });
  else if (tr.type === 'peertube' && pt) void pt.seek(sec);
}
export function setVolume(v: number): void {
  pl.volume = Math.min(1, Math.max(0, v)); wr('bd-player-volume', String(pl.volume));
  const tr = pl.current; if (!tr) return;
  if (audio) audio.volume = pl.volume;
  if (tr.type === 'youtube') ytCmd('setVolume', [Math.round(pl.volume * 100)]);
  else if (tr.type === 'suno') sunoCmd('setVolume', { volume: pl.volume });
  else if (tr.type === 'peertube' && pt) void pt.setVolume(pl.volume);
}
export function cycleMode(): void { pl.mode = MODES[(MODES.indexOf(pl.mode) + 1) % MODES.length]; wr('bd-player-mode', pl.mode); }
/** Stops everything and hides the player (a pinned one stays visible, empty). The queue and the playlists are kept. */
export function stopPlayer(): void { stopEngines(); pl.current = null; pl.auto = []; pl.expanded = false; pl.error = ''; }
export function setPinned(on: boolean): void { pl.pinned = on; wr('bd-player-pinned', on ? '1' : '0'); if (!on) stopPlayer(); }

// queue
export const addToQueue = (tr: Track): void => { pl.queue.push({ ...tr }); toast(t('playerQueued')); };
export const removeFromQueue = (i: number): void => { pl.queue.splice(i, 1); };
export const playFromQueue = (i: number): void => { const [x] = pl.queue.splice(i, 1); if (x) { remember(pl.current); playTrack(x); } };
export const clearQueue = (): void => { pl.queue = []; };
export const clearHistory = (): void => { pl.history = []; };
// playlists
export const newPlaylist = (name: string): Playlist | null => {
  const n = name.trim().slice(0, 60); if (!n) return null;
  const p: Playlist = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, tracks: [], updatedAt: Date.now() };
  lists.items.push(p); return p;
};
export const deletePlaylist = (id: string): void => { lists.items = lists.items.filter((p) => p.id !== id); };
export const addToPlaylist = (id: string, tr: Track): void => {
  const p = lists.items.find((x) => x.id === id); if (!p) return;
  if (p.tracks.some((x) => x.key === tr.key)) { toast(t('playerInList')); return; }
  p.tracks.push({ ...tr, sponsored: undefined }); p.updatedAt = Date.now(); toast(t('playerAddedList', { n: p.name }));
};
export const removeFromPlaylist = (id: string, i: number): void => { const p = lists.items.find((x) => x.id === id); if (p) { p.tracks.splice(i, 1); p.updatedAt = Date.now(); } };
export function playPlaylist(id: string, at = 0): void {
  const p = lists.items.find((x) => x.id === id); if (!p?.tracks.length) return;
  playFromPost(p.tracks.map((x) => ({ ...x })), at);
}

// ─── ▶ and ＋ chips in rendered posts ─────────────────────────────────────
const toTrack = (el: Element): Track | null => {
  const type = el.getAttribute('data-mt') ?? '', id = el.getAttribute('data-mid') ?? '';
  const t0 = clean({ type, id, host: el.getAttribute('data-mh'), src: el.getAttribute('data-ms'), pending: el.hasAttribute('data-mp'), title: el.getAttribute('data-mtitle') });
  return t0; // everything is re-validated here, the markup is never trusted
};
document.addEventListener('click', (e) => {
  const chip = (e.target as Element | null)?.closest?.('button.media-chip, button.media-play, button.media-add'); if (!chip) return;
  e.preventDefault(); e.stopPropagation();
  if (chip.classList.contains('media-add')) { const tr = toTrack(chip); if (tr) addToQueue(tr); return; }
  const scope = chip.closest('.md') ?? document.body;
  const tracks: Track[] = []; let at = 0;
  for (const c of scope.querySelectorAll('button.media-chip, button.media-play')) {
    const tr = toTrack(c); if (!tr) continue;
    let i = tracks.findIndex((x) => x.key === tr.key); if (i < 0) { tracks.push(tr); i = tracks.length - 1; }
    if (c === chip) at = i;
  }
  playFromPost(tracks, at);
}, true);

// PeerTube cards: fill in the real thumbnail and title when the card appears on a page (a lookup per video, nothing before that)
const hydrate = (root: ParentNode): void => {
  for (const card of Array.from(root.querySelectorAll?.('.media-card[data-hydrate]') ?? [])) {
    card.removeAttribute('data-hydrate');
    const b = card.querySelector('button.media-play'); const host = b?.getAttribute('data-mh') ?? '', id = b?.getAttribute('data-mid') ?? '';
    const type = b?.getAttribute('data-mt');
    if (!b || !/^[a-z0-9.-]*$/.test(host) || !id) continue;
    void (type === 'youtube' ? youtubeMeta(id) : peertubeMeta(host, id)).then(() => {
      const m = meta[`${type}:${id}`]; if (!m) return;
      if (m.cover) { let im = b.querySelector('img'); if (!im) { im = document.createElement('img'); im.alt = ''; im.referrerPolicy = 'no-referrer'; b.querySelector('.mc-thumb')?.prepend(im); } im.src = m.cover; }
      const ti = b.querySelector('.mc-title'); if (m.title && ti && !b.hasAttribute('data-mtitle')) ti.textContent = m.title;
    });
  }
};
new MutationObserver((muts) => { for (const m of muts) for (const n of Array.from(m.addedNodes)) if (n.nodeType === 1) hydrate(n as Element); }).observe(document.body, { childList: true, subtree: true });
