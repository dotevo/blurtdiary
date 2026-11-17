/**
 * Calls a chain's nodes have all refused for good ("Could not find API bridge", a plugin that is not enabled): remembered for a few hours, so the page stops
 * sending requests that can only fail (and spamming the console with them). The registry survives reloads; after the TTL the call is tried again,
 * because a node may have been upgraded since.
 */
const KEY = 'bd-dead-apis', TTL = 6 * 3600 * 1000;
let dead: Record<string, number> = {};
try { dead = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* none */ }
const save = (): void => { try { localStorage.setItem(KEY, JSON.stringify(dead)); } catch { /* ignore */ } };
export const deadKey = (chain: string, api: string, method: string): string => `${chain}.${api}.${method}`;
export function isDead(key: string): boolean {
  const t = dead[key]; if (!t) return false;
  if (Date.now() - t > TTL) { delete dead[key]; save(); return false; }
  return true;
}
export function markDead(key: string): void { dead[key] = Date.now(); save(); }
/** Errors that say "this node will never do that" (not "this one request was wrong"). */
export const isPermanent = (message: string): boolean => /could not find api|api_itr|plugin not enabled|method not found|no such method/i.test(message);
