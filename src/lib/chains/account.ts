/** Account helpers shared by the chain adapters (the field NAMES that differ per chain stay in each adapter). */
import type { ChainAccount } from './types';

export const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;
const REGEN_SECONDS = 5 * 24 * 3600; // full voting power regenerates in 5 days on every chain of this family

/**
 * Current voting power in percent (0–100), or null when the node does not expose it.
 *  - mana-bar chains (voting_manabar): current_mana + regeneration, relative to the effective vesting shares
 *  - classic chains (voting_power + last_vote_time): basis points + 20%/day regeneration
 */
export function votingPowerPct(acc: ChainAccount): number | null {
  const now = Date.now() / 1000;
  const mb = acc.voting_manabar as { current_mana?: string | number; last_update_time?: number } | undefined;
  if (mb && mb.current_mana != null) {
    const max = (num(acc.vesting_shares) + num(acc.received_vesting_shares) - num(acc.delegated_vesting_shares)) * 1e6;
    if (max <= 0) return 0;
    const cur = Math.min(max, num(mb.current_mana) + Math.max(0, now - (mb.last_update_time ?? now)) * max / REGEN_SECONDS);
    return (cur / max) * 100;
  }
  if (acc.voting_power != null) {
    const last = Date.parse(String(acc.last_vote_time ?? '') + 'Z') / 1000 || now;
    return Math.min(100, (num(acc.voting_power) + Math.max(0, now - last) * 10000 / REGEN_SECONDS) / 100);
  }
  return null;
}

/** "1.234 HIVE + 0.5 HBD + 12.000 HP" – only the non-zero parts. */
export const joinParts = (parts: [number, string][]): string => parts.filter(([n]) => n > 0).map(([n, s]) => `${n.toFixed(3)} ${s}`).join(' + ');
