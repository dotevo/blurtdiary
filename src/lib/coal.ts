/**
 * COAL list (coal.blurtwallet.com) – accounts flagged as spammers/scammers/impersonators.
 * Ported from BlurtForum's modules/coal-list.ts: fetched at most once a day, cached in localStorage,
 * a failed fetch falls back to the stale cache.
 */
import { shallowRef } from 'vue';

export interface CoalEntry { reason: string; notes: string }

const COAL_URL = 'https://coal.blurtwallet.com/';
const CACHE_KEY = 'bd_coal_list_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
type Cache = { ts: number; entries: [string, CoalEntry][] };

function readCache(): Cache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return parsed && Array.isArray(parsed.entries) ? (parsed as Cache) : null;
  } catch { return null; }
}

export async function loadCoalList(): Promise<Map<string, CoalEntry>> {
  const cached = readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return new Map(cached.entries);
  try {
    const res = await fetch(COAL_URL);
    if (!res.ok) throw new Error(`COAL fetch failed: ${res.status}`);
    const data = await res.json();
    const entries: [string, CoalEntry][] = (Array.isArray(data) ? data : [])
      .filter((e: { name?: unknown }) => e && typeof e.name === 'string')
      .map((e: { name: string; reason?: string; notes?: string }) => [e.name.toLowerCase(), { reason: e.reason ?? '', notes: e.notes ?? '' }]);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), entries } as Cache)); } catch { /* ignore */ }
    return new Map(entries);
  } catch (e) {
    console.warn('COAL list fetch error, using cache:', (e as Error).message);
    return cached ? new Map(cached.entries) : new Map();
  }
}

export const coalMap = shallowRef<Map<string, CoalEntry>>(new Map());
/** Resolves when the list is loaded – await before building "recent comments". */
export const coalReady: Promise<void> = loadCoalList().then((m) => {
  // ?coal=name1,name2 marks extra accounts as COAL – handy to test the blur without waiting for a real spammer
  new URLSearchParams(location.search).get('coal')?.split(',').forEach((n) => { if (n.trim()) m.set(n.trim().toLowerCase(), { reason: 'test (?coal=)', notes: '' }); });
  coalMap.value = m;
  console.info(`[coal] list ready: ${m.size} accounts`);
}).catch(() => { /* keep empty map */ });
export const coalOf = (name: string): CoalEntry | undefined => coalMap.value.get(name.toLowerCase());
