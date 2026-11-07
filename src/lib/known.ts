/**
 * Who is who across chains. Every Blurt blog we visit declares its owner's accounts on the other chains (config `chains:`).
 * We keep them on this device, so that later a post or a reply that reaches us from ONE chain (a notification, a tag view)
 * can be traced back to the Blurt blog and the author's accounts on the other chains – the post's own page has no config.
 * Same permlink on several chains means the same post (permlinks carry a hash suffix, so they do not repeat for other posts).
 * Only what a blog declares for itself is stored; an account claimed by two different blogs is treated as unknown.
 */
import { CHAINS, PRIMARY } from './chains';
import { normAccount } from './config';

const KEY = 'bd-known-accounts';
const MAX = 300;
type Known = Record<string, Record<string, string>>; // blurt user -> { chain -> account }

const read = (): Known => { try { const o = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };

/** Called when a blog's config is loaded. */
export function rememberAccounts(user: string, accounts?: Record<string, string>): void {
  const clean: Record<string, string> = {};
  for (const c of CHAINS) { const a = c.id === PRIMARY ? '' : normAccount(accounts?.[c.id]); if (a) clean[c.id] = a; }
  try {
    const all = read();
    if (Object.keys(clean).length) { delete all[user]; all[user] = clean; } else delete all[user]; // re-inserted last = most recently seen
    const users = Object.keys(all); for (const u of users.slice(0, Math.max(0, users.length - MAX))) delete all[u];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** The Blurt user whose blog declared `account` on `chain` (undefined when unknown or claimed by several blogs). */
export function ownerOf(chain: string, account: string): string | undefined {
  if (chain === PRIMARY) return account;
  const hit = Object.entries(read()).filter(([, m]) => m[chain] === account).map(([u]) => u);
  return hit.length === 1 ? hit[0] : undefined;
}

/** The accounts of a Blurt user on the other chains, as far as we have seen them. */
export const accountsOf = (user: string): Record<string, string> => ({ ...(read()[user] ?? {}) });
