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

/** Does `me` follow the blog owner? `get_following` lists accounts alphabetically from `start`, so asking for 1 entry from USER answers it. */
export async function loadFollow(): Promise<void> {
  follow.state = 'unknown';
  const me = auth.me?.user; if (!me || !USER || me === USER) return;
  try {
    const r = await rpc<{ following: string }[]>('condenser_api', 'get_following', [me, USER, 'blog', 1]);
    if (auth.me?.user === me) follow.state = r?.[0]?.following === USER ? 'yes' : 'no';
  } catch (e) { console.warn('follow state', e); } // unknown = the button is simply not shown
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
