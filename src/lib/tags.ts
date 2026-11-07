/** Followed tags of the logged-in visitor – private, kept in this browser only (never written to a chain). */
import { computed, reactive, watch } from 'vue';
import { auth } from './auth';

export const TAG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const MAX_FOLLOWED_TAGS = 12;
export const normTag = (s: string): string => s.trim().replace(/^#/, '').toLowerCase();

const who = computed(() => auth.me?.user ?? Object.values(auth.sessions)[0]?.user ?? '');
const key = (): string => `bd-wtags-${who.value}`;
export const followed = reactive<{ tags: string[] }>({ tags: [] });
const read = (): string[] => {
  try { const a = JSON.parse(localStorage.getItem(key()) ?? '[]'); return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && TAG_RE.test(x)).slice(0, MAX_FOLLOWED_TAGS) : []; } catch { return []; }
};
const save = (): void => { try { localStorage.setItem(key(), JSON.stringify(followed.tags)); } catch { /* ignore */ } };
watch(who, () => { followed.tags = who.value ? read() : []; }, { immediate: true });

export const isFollowedTag = (t: string): boolean => followed.tags.includes(normTag(t));
/** false when the tag is invalid or the list is full */
export function followTag(t: string): boolean {
  const n = normTag(t);
  if (!TAG_RE.test(n) || !who.value) return false;
  if (!followed.tags.includes(n)) { if (followed.tags.length >= MAX_FOLLOWED_TAGS) return false; followed.tags.push(n); save(); }
  return true;
}
export function unfollowTag(t: string): void { followed.tags = followed.tags.filter((x) => x !== normTag(t)); save(); }
