/**
 * Recognises embeddable media links (YouTube, Suno, PeerTube on blurt.media, plain audio files). Used by renderMd (to put a ▶ chip next to
 * the link) and by the player. NOTHING is loaded from these hosts while a post is only read: no thumbnails, no iframes, no scripts.
 */
export type MediaType = 'youtube' | 'suno' | 'peertube' | 'audio';
export interface MediaRef { type: MediaType; id: string; host?: string; src?: string; pending?: boolean }
/** PeerTube instances the CSP lets us embed (frame-src in index.html). Any other instance stays a normal link. */
export const PEERTUBE_HOSTS = ['blurt.media'];
/** Worker that fetches a Suno share page (suno.com/s/…) and PeerTube metadata for us (the browser cannot read those pages itself). */
export const PROXY_BASE = 'https://patient-firefly-be68.dotevo.workers.dev/';
/** Our own embed page for Suno (the page controlled through postMessage). */
export const SUNO_EMBED_BASE = 'https://calm-darkness-5ea2.dotevo.workers.dev/embed';

const YT = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})(?![A-Za-z0-9_-])/i;
const SUNO = /^https?:\/\/(?:www\.)?suno\.com\/song\/([A-Za-z0-9-]{20,40})(?![A-Za-z0-9-])/i;
const SUNO_SHARE = /^https?:\/\/(?:www\.)?suno\.com\/s\/([A-Za-z0-9]{6,32})(?![A-Za-z0-9])/i; // short share link: the song id is looked up when it is played
const PT = /^https?:\/\/([a-z0-9.-]+)\/(?:w|videos\/watch|videos\/embed)\/([A-Za-z0-9-]{8,40})(?![A-Za-z0-9-])/i;
const AUDIO = /^https:\/\/[^\s"'<>]+\.(?:mp3|wav|ogg|m4a|flac)(?:\?[^\s"'<>]*)?$/i;

export function detectMedia(href: string): MediaRef | null {
  const u = (href ?? '').trim();
  let m = u.match(YT); if (m) return { type: 'youtube', id: m[1] };
  m = u.match(SUNO); if (m) return { type: 'suno', id: m[1] };
  m = u.match(SUNO_SHARE); if (m) return { type: 'suno', id: m[1], pending: true };
  m = u.match(PT); if (m && PEERTUBE_HOSTS.includes(m[1].toLowerCase())) return { type: 'peertube', id: m[2], host: m[1].toLowerCase() };
  if (AUDIO.test(u)) return { type: 'audio', id: u.slice(0, 200), src: u };
  return null;
}
export const mediaLabel = (r: MediaRef): string => ({ youtube: 'YouTube', suno: 'Suno', peertube: r.host ?? 'PeerTube', audio: 'Audio' })[r.type];
