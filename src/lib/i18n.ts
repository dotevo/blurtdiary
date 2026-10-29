/** Same approach as BlurtForum: one JSON file per language in public/locales, English as fallback for missing keys. */
import { reactive, ref } from 'vue';

export type Lang = 'en' | 'pl' | 'eo' | 'de' | 'fr' | 'es';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'pl', label: 'Polski' }, { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' }, { code: 'es', label: 'Español' }, { code: 'eo', label: 'Esperanto' },
];
const KEY = 'bd-lang';
function detect(): Lang {
  try { const s = localStorage.getItem(KEY) as Lang | null; if (s && LANGS.some((l) => l.code === s)) return s; } catch { /* ignore */ }
  const b = navigator.language.slice(0, 2).toLowerCase();
  return LANGS.find((l) => l.code === b)?.code ?? 'en';
}

const TR = reactive<Record<string, string>>({});
const cache: Partial<Record<Lang, Record<string, string>>> = {};
export const lang = ref<Lang>(detect());
/** True when the visitor picked a language before (then the blog's default language must not override it). */
export const langSaved = (): boolean => { try { return !!localStorage.getItem(KEY); } catch { return false; } };

async function fetchLocale(l: Lang): Promise<Record<string, string>> {
  if (cache[l]) return cache[l]!;
  const r = await fetch(`locales/${l}.json`);
  if (!r.ok) throw new Error(`Failed to load locale: ${l}`);
  return (cache[l] = await r.json());
}
export async function loadLanguage(l: Lang): Promise<void> {
  const en = await fetchLocale('en').catch(() => ({}));
  const cur = l === 'en' ? en : await fetchLocale(l).catch(() => ({}));
  Object.keys(TR).forEach((k) => delete TR[k]);
  Object.assign(TR, en, cur);
  lang.value = l; document.documentElement.lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
}
/** t('key', { n: 3 }) – replaces {n}. Reactive: templates re-render when the language changes. */
export const t = (k: string, v?: Record<string, string | number>): string => {
  let s = TR[k] ?? k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(String(b));
  return s;
};
