/**
 * Another person on one chain: profile data and the on-chain follow relation, for the profile page.
 * Nothing here belongs to a blog – a profile is "what this account writes / do I follow it" on that chain.
 */
import { reactive } from 'vue';
import { auth, broadcast } from './auth';
import { adapter } from './chains';
import { t } from './i18n';
import { toast } from './toast';
import type { Operation } from './types';

export interface ProfileInfo { name?: string; about?: string; exists: boolean; loading: boolean; error: string; key: string }
export const info = reactive<ProfileInfo>({ exists: false, loading: false, error: '', key: '' });
export const rel = reactive<{ state: 'unknown' | 'yes' | 'no'; busy: boolean; key: string }>({ state: 'unknown', busy: false, key: '' });

export async function loadInfo(chain: string, account: string): Promise<void> {
  const key = `${chain}:${account}`; if (info.key === key) return;
  Object.assign(info, { key, loading: true, exists: false, error: '', name: undefined, about: undefined });
  try {
    const r = await adapter(chain).call<Record<string, string>[]>('condenser_api', 'get_accounts', [[account]]);
    if (info.key !== key) return;
    const acc = Array.isArray(r) ? r[0] : undefined;
    info.exists = !!acc;
    if (acc) {
      let prof: { name?: unknown; about?: unknown } = {};
      try { prof = JSON.parse(acc.posting_json_metadata || acc.json_metadata || '{}').profile ?? {}; } catch { /* ignore */ }
      info.name = typeof prof.name === 'string' ? prof.name.slice(0, 80) : undefined; info.about = typeof prof.about === 'string' ? prof.about.slice(0, 300) : undefined;
    }
  } catch (e) { if (info.key === key) info.error = (e as Error).message || String(e); }
  if (info.key === key) info.loading = false;
}

/** Do I (the account I am logged in with on `chain`) follow `account` there? Same two-step check as the blog's follow button. */
export async function loadRel(chain: string, account: string): Promise<void> {
  const me = auth.sessions[chain]?.user; const key = `${chain}:${account}`;
  Object.assign(rel, { state: 'unknown', key });
  if (!me || me === account) return;
  const a = adapter(chain); let yes: boolean | null = null;
  try {
    const r = await a.call<{ follows?: boolean } | null>('bridge', 'get_relationship_between_accounts', [me, account]);
    if (r && typeof r.follows === 'boolean') yes = r.follows;
  } catch { /* older call */ }
  if (yes === null) {
    try {
      const before = account.slice(0, -1) + String.fromCharCode(account.charCodeAt(account.length - 1) - 1) + 'z';
      const r = await a.call<{ following: string }[]>('condenser_api', 'get_following', [me, before, 'blog', 5]);
      if (Array.isArray(r)) yes = r.some((x) => x?.following === account);
    } catch (e) { console.warn('relation', chain, e); }
  }
  if (rel.key === key && yes !== null) rel.state = yes ? 'yes' : 'no';
}

export async function setRel(chain: string, account: string, on: boolean): Promise<void> {
  const me = auth.sessions[chain]?.user; if (!me || me === account || rel.busy) return;
  rel.busy = true;
  try {
    const op: Operation = ['custom_json', { required_auths: [], required_posting_auths: [me], id: 'follow', json: JSON.stringify(['follow', { follower: me, following: account, what: on ? ['blog'] : [] }]) }];
    await broadcast([op], chain);
    if (rel.key === `${chain}:${account}`) rel.state = on ? 'yes' : 'no';
    toast(t(on ? 'followOk' : 'unfollowOk', { u: account }));
  } catch (e) { toast((e as Error).message || t('followFailed')); }
  rel.busy = false;
}
