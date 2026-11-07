/** Real (on-chain) follow of the blog's owner on Blurt - what the Feed is built from. The ★ stays a local bookmark. */
import { reactive, watch } from 'vue';
import { auth, broadcast } from './auth';
import { reloadFeed } from './feed';
import { t } from './i18n';
import { rpc } from './rpc';
import { USER } from './store';
import { toast } from './toast';
import type { Operation } from './types';

export const follow = reactive<{ state: 'unknown' | 'yes' | 'no'; busy: boolean }>({ state: 'unknown', busy: false });

/**
 * Does `me` follow the blog owner?
 * 1. `bridge.get_relationship_between_accounts` answers it directly (hivemind nodes).
 * 2. Otherwise `get_following` is asked from a name just BEFORE the owner's, a few entries, and the owner is looked for among them –
 *    whether a node treats `start` as inclusive or exclusive, the owner is then in the answer when followed.
 */
export async function loadFollow(): Promise<void> {
  follow.state = 'unknown';
  const me = auth.me?.user; if (!me || !USER || me === USER) return;
  let yes: boolean | null = null;
  try {
    const r = await rpc<{ follows?: boolean } | null>('bridge', 'get_relationship_between_accounts', [me, USER]);
    if (r && typeof r.follows === 'boolean') yes = r.follows;
  } catch { /* try the older call */ }
  if (yes === null) {
    try {
      const before = USER.slice(0, -1) + String.fromCharCode(USER.charCodeAt(USER.length - 1) - 1) + 'z';
      const r = await rpc<{ following: string }[]>('condenser_api', 'get_following', [me, before, 'blog', 5]);
      if (Array.isArray(r)) yes = r.some((x) => x?.following === USER);
    } catch (e) { console.warn('follow state', e); } // unknown = the button is simply not shown
  }
  if (auth.me?.user === me && yes !== null) follow.state = yes ? 'yes' : 'no';
}

export async function setFollow(on: boolean): Promise<void> {
  const me = auth.me?.user; if (!me || me === USER || follow.busy) return;
  follow.busy = true;
  try {
    const op: Operation = ['custom_json', { required_auths: [], required_posting_auths: [me], id: 'follow',
      json: JSON.stringify(['follow', { follower: me, following: USER, what: on ? ['blog'] : [] }]) }];
    await broadcast([op]);
    follow.state = on ? 'yes' : 'no';
    toast(t(on ? 'followOk' : 'unfollowOk', { u: USER }));
    void reloadFeed(); // the feed now includes / drops this blog
  } catch (e) { toast((e as Error).message || t('followFailed')); }
  follow.busy = false;
}
watch(() => auth.me?.user, () => { void loadFollow(); }, { immediate: true });
