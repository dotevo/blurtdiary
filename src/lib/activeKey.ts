import { reactive } from 'vue';

/**
 * Asking for the ACTIVE key (transfers, power up / down). It is never stored: the dialog hands the typed key to the one signature that needs it and the
 * caller drops it right after. The state below only describes what the dialog shows.
 */
export const activeAsk = reactive<{ open: boolean; chain: string; account: string; summary: string }>({ open: false, chain: '', account: '', summary: '' });
let pending: { resolve: (k: string) => void; reject: (e: Error) => void } | null = null;

export function askActiveKey(chain: string, account: string, summary: string): Promise<string> {
  pending?.reject(new Error('cancelled'));
  Object.assign(activeAsk, { open: true, chain, account, summary });
  return new Promise((resolve, reject) => { pending = { resolve, reject }; });
}
export function answerActiveKey(key: string | null): void {
  activeAsk.open = false;
  const p = pending; pending = null;
  if (!p) return;
  if (key) p.resolve(key); else p.reject(new Error('cancelled'));
}
