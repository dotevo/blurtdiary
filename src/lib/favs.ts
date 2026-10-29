/**
 * Followed blogs ("star"): kept on this device (localStorage), so no signature or popup is needed.
 * Entries remember the blog's title (updated whenever the blog is visited) so the list can show more than a bare account name.
 */
import { reactive, ref } from 'vue';

export interface Fav { u: string; t?: string }
const KEY = 'bd-favs';
const NAME = /^[a-z][a-z0-9.-]{2,15}$/;

function read(): Fav[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(a) ? a.filter((x) => x && typeof x.u === 'string' && NAME.test(x.u)).map((x) => ({ u: x.u, t: typeof x.t === 'string' ? x.t.slice(0, 80) : undefined })) : [];
  } catch { return []; }
}
export const favs = reactive<{ list: Fav[] }>({ list: read() });
/** Panel with the list (opened from the "★" chip, mainly for phones). */
export const favOpen = ref(false);

const save = (): void => { try { localStorage.setItem(KEY, JSON.stringify(favs.list)); } catch { /* ignore */ } };
export const isFav = (u: string): boolean => favs.list.some((f) => f.u === u);

export function toggleFav(u: string, title?: string): void {
  const i = favs.list.findIndex((f) => f.u === u);
  if (i >= 0) favs.list.splice(i, 1); else if (NAME.test(u)) favs.list.push({ u, t: title?.slice(0, 80) });
  save();
}
/** Keeps the stored title of a followed blog current. */
export function touchFav(u: string, title?: string): void {
  const f = favs.list.find((x) => x.u === u);
  if (f && title && f.t !== title.slice(0, 80)) { f.t = title.slice(0, 80); save(); }
}
