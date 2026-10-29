import { ref } from 'vue';
const K = 'bd-vote-weight';
const read = (): number => { try { const n = parseInt(localStorage.getItem(K) ?? '100', 10); return n >= 1 && n <= 100 ? n : 100; } catch { return 100; } };
/** Vote weight in percent (1–100), remembered between visits – same idea as `bf-vote-weight` in BlurtForum. */
export const voteWeight = ref(read());
export function setVoteWeight(n: number): void {
  voteWeight.value = Math.min(100, Math.max(1, Math.round(n)));
  try { localStorage.setItem(K, String(voteWeight.value)); } catch { /* ignore */ }
}

const DK = 'bd-devtip';
/** "Dev tip": 1% of the rewards of comments/posts made through this site goes to the app author. On by default, can be switched off. */
export const devTip = ref((() => { try { return localStorage.getItem(DK) !== 'false'; } catch { return true; } })());
export function setDevTip(on: boolean): void { devTip.value = on; try { localStorage.setItem(DK, String(on)); } catch { /* ignore */ } }
