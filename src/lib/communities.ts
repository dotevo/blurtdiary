import { adapter } from './chains';
import { COMMUNITY_RE } from './publish';

export interface Sub { id: string; title: string; role: string }
const cache: Record<string, Promise<Sub[]>> = {};

/** Communities `account` subscribes to on Blurt (bridge `list_all_subscriptions`, older nodes: `list_subscriptions`): rows are [id, title, role, …]. */
export function loadSubscriptions(account: string): Promise<Sub[]> {
  return (cache[account] ??= (async () => {
    for (const m of ['list_all_subscriptions', 'list_subscriptions']) {
      try {
        const r = await adapter('blurt').call<unknown>('bridge', m, { account });
        if (Array.isArray(r)) {
          return r.filter((x): x is unknown[] => Array.isArray(x) && typeof x[0] === 'string' && COMMUNITY_RE.test(x[0]))
            .map((x) => ({ id: String(x[0]), title: String(x[1] ?? x[0]).slice(0, 80), role: String(x[2] ?? '') }))
            .sort((a, b) => a.title.localeCompare(b.title));
        }
      } catch (e) { console.warn('subscriptions', m, e); }
    }
    return [];
  })());
}
