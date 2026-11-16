/**
 * Queue of the per-chain sending jobs (a post copy, an edit of a copy, a comment on one chain). Every job is kept in localStorage while it runs and when it
 * failed, so it survives a page refresh and can be retried from the floating button; finished jobs disappear on their own. Payloads are plain data
 * (the post / comment text, images), never keys – a retry signs again with the session of that chain.
 */
import { reactive } from 'vue';
import { watch } from 'vue';

export interface Job { id: string; kind: string; chain: string; title: string; status: 'running' | 'failed' | 'done'; error?: string; payload: unknown; time: number }
const KEY = 'bd-jobs';
const load = (): Job[] => {
  try { return (JSON.parse(localStorage.getItem(KEY) || '[]') as Job[]).filter((j) => j.status !== 'done').map((j) => (j.status === 'running' ? { ...j, status: 'failed' as const, error: 'interrupted' } : j)); } catch { return []; }
};
export const jobs = reactive<Job[]>(load());
watch(jobs, () => { try { localStorage.setItem(KEY, JSON.stringify(jobs)); } catch { /* storage full or blocked: the queue still works in memory */ } }, { deep: true });

const executors = new Map<string, (payload: never, chain: string) => Promise<unknown>>();
/** Registers how a retry runs jobs of `kind`. */
export const registerJob = <P>(kind: string, run: (payload: P, chain: string) => Promise<unknown>): void => { executors.set(kind, run as never); };

let timer: ReturnType<typeof setTimeout> | undefined;
function settle(): void {
  clearTimeout(timer);
  if (jobs.some((j) => j.status !== 'done')) return;
  timer = setTimeout(() => { if (!jobs.some((j) => j.status !== 'done')) jobs.splice(0, jobs.length); }, 2500); // all went through: the button goes away
}

/** Runs `run` as a tracked job: shown while it runs, kept (with the reason) when it fails. Returns / throws exactly what `run` does. */
export async function queued<T>(kind: string, chain: string, title: string, payload: unknown, run: () => Promise<T>): Promise<T> {
  clearTimeout(timer);
  const j = jobs[jobs.push({ id: Math.random().toString(36).slice(2), kind, chain, title, status: 'running', payload, time: Date.now() }) - 1];
  try { const r = await run(); j.status = 'done'; settle(); return r; }
  catch (e) { j.status = 'failed'; j.error = (e as Error).message || 'error'; throw e; }
}

export async function retry(id: string): Promise<void> {
  const j = jobs.find((x) => x.id === id); const run = j && executors.get(j.kind);
  if (!j || !run || j.status === 'running') return;
  clearTimeout(timer); j.status = 'running'; j.error = '';
  try { await run(j.payload as never, j.chain); j.status = 'done'; } catch (e) { j.status = 'failed'; j.error = (e as Error).message || 'error'; }
  settle();
}
export const retryAll = async (): Promise<void> => { await Promise.all(jobs.filter((j) => j.status === 'failed').map((j) => retry(j.id))); };
/** Removes finished and failed jobs (running ones stay). */
export const clearJobs = (): void => { for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].status !== 'running') jobs.splice(i, 1); };
export const remove = (id: string): void => { const i = jobs.findIndex((j) => j.id === id && j.status !== 'running'); if (i >= 0) jobs.splice(i, 1); };
