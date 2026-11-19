/**
 * Sponsored tracks in the player (same rules as in BlurtForum). An advertiser sends BLURT to SPONSOR_ACCOUNT with a JSON memo:
 *   {"url":"https://youtu.be/xxxx","sec":30,"start":"2026-11-20","days":3}
 *     url   – a YouTube or blurt.media link (required)      sec  – seconds before the track is skipped (1–120)
 *     start – ISO date, UTC (required)                      days – campaign length (1–7, default 1)
 * Weight of a campaign (BPS) = amount / days / sec. On an advance of the player a sponsored track is played with a chance of
 * SPONSORED_RATIO, picked by weighted lottery among the campaigns active that day, never twice in a row; the reader can skip it any time.
 */
import { reactive } from 'vue';
import { adapter } from './chains';
import { detectMedia } from './media';
import { setSponsorHook, type Track } from './player';

export const SPONSOR_ACCOUNT = 'dotevo';
const WINDOW_DAYS = 14, SEC_MIN = 1, SEC_MAX = 120, DAYS_MIN = 1, DAYS_MAX = 7, PAGE = 500, MAX_PAGES = 20, REFRESH_MS = 6 * 3600_000, SPONSORED_RATIO = 0.2;
export interface Campaign { id: string; from: string; url: string; sec: number; start: number; days: number; end: number; amount: number; bps: number }
export const sp = reactive<{ list: Campaign[]; loading: boolean; at: number }>({ list: [], loading: false, at: 0 });

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const isoDay = (raw: unknown): number | null => { if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null; const ms = Date.parse(`${raw}T00:00:00Z`); return Number.isNaN(ms) ? null : ms; };
function parse(memo: string, amount: number, id: string, from: string): Campaign | null {
  if (!(amount > 0) || !from) return null;
  let d: any; try { d = JSON.parse(memo); } catch { return null; } // an ordinary transfer
  if (!d || typeof d !== 'object' || typeof d.url !== 'string' || !/^https?:\/\//i.test(d.url)) return null;
  const start = isoDay(d.start); if (start === null) return null;
  const secN = Number(d.sec); if (!(secN > 0)) return null;
  const daysN = d.days === undefined ? 1 : Number(d.days); if (!(daysN > 0)) return null;
  const sec = clamp(Math.round(secN), SEC_MIN, SEC_MAX), days = clamp(Math.round(daysN), DAYS_MIN, DAYS_MAX);
  return { id, from, url: d.url.slice(0, 300), sec, start, days, end: start + days * 86_400_000, amount, bps: amount / days / sec };
}
const extract = (ops: any[]): Campaign[] => {
  const out: Campaign[] = [];
  for (const e of ops) {
    const op = e?.[1]?.op; if (!op || op[0] !== 'transfer' || op[1]?.to !== SPONSOR_ACCOUNT) continue;
    const [amt, cur] = String(op[1].amount ?? '').split(' '); if (cur !== 'BLURT') continue;
    const c = parse(String(op[1].memo ?? ''), parseFloat(amt), String(e[0]), String(op[1].from ?? '')); if (c) out.push(c);
  }
  return out;
};

/** Reads the transfers to the sponsor account of the last WINDOW_DAYS days (newest page first, going back). */
export async function refreshCampaigns(): Promise<void> {
  if (sp.loading) return; sp.loading = true;
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000; const got: Campaign[] = []; let start = -1, ok = true;
  try {
    let filtered = true;
    for (let page = 0; page < MAX_PAGES; page++) {
      let batch: any[]; const lim = start < 0 ? PAGE : Math.min(PAGE, start + 1); // a node wants limit <= start + 1
      try { batch = await adapter('blurt').call<any[]>('condenser_api', 'get_account_history', filtered ? [SPONSOR_ACCOUNT, start, lim, 4, null] : [SPONSOR_ACCOUNT, start, lim]); }
      catch (e) { if (!filtered) throw e; filtered = false; batch = await adapter('blurt').call<any[]>('condenser_api', 'get_account_history', [SPONSOR_ACCOUNT, start, lim]); } // a node without the operation filter
      if (!Array.isArray(batch) || !batch.length) break;
      got.push(...extract(batch));
      const oldest = batch[0]; const ts = Date.parse(`${oldest[1]?.timestamp}Z`);
      if (Number.isNaN(ts) || ts <= cutoff || oldest[0] <= 0 || (!filtered && page >= 5)) break;
      if (start >= 0 && oldest[0] - 1 >= start) break; // the node did not move on
      start = oldest[0] - 1;
    }
  } catch { ok = false; }
  if (ok) { sp.list = [...new Map(got.map((c) => [c.id, c])).values()]; sp.at = Date.now(); }
  sp.loading = false;
}
export const activeCampaigns = (now = Date.now()): Campaign[] => sp.list.filter((c) => now >= c.start && now <= c.end);
const pick = (cs: Campaign[]): Campaign | null => {
  if (!cs.length) return null;
  const total = cs.reduce((s, c) => s + c.bps, 0); if (total <= 0) return cs[Math.floor(Math.random() * cs.length)];
  let r = Math.random() * total; for (const c of cs) { r -= c.bps; if (r <= 0) return c; }
  return cs[cs.length - 1];
};
function toTrack(c: Campaign): Track | null {
  const ref = detectMedia(c.url);
  if (!ref || (ref.type !== 'youtube' && ref.type !== 'peertube')) return null; // video ads only, like in the forum
  return { ...ref, key: `ad:${c.id}`, title: `🔸 Sponsored: ${c.from}`, sponsored: { id: c.id, sec: c.sec } };
}

let started = false;
/** Called on the first ▶ press: loads the campaigns and starts the 6 h refresh. Nothing is requested while posts are only read. */
export function initSponsored(): void {
  if (started) return; started = true;
  void refreshCampaigns(); setInterval(() => { void refreshCampaigns(); }, REFRESH_MS);
  setSponsorHook((leaving) => {
    if (leaving?.sponsored) return null; // never two ads in a row
    if (Math.random() > SPONSORED_RATIO) return null;
    const c = pick(activeCampaigns()); return c ? toTrack(c) : null;
  });
}
