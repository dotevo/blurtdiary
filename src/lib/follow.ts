/**
 * Real (on-chain) follow of the blog's owner – on EVERY chain you are logged in to where the owner has an account (Blurt, plus the accounts the blog lists
 * for Hive, Steem, Melek …). The Feed is built from these relations. The ★ stays a local bookmark.
 */
import { reactive, watch } from 'vue';
import { auth } from './auth';
import { reloadFeed } from './feed';
import { reloadWorldFeed } from './world';
import { adapter, PRIMARY } from './chains';
import { t } from './i18n';
import { followOn, relationOn } from './profile';
import { state, USER } from './store';
import { toast } from './toast';

interface Target { chain: string; account: string; me: string; yes: boolean | null }
export const follow = reactive<{ state: 'unknown' | 'yes' | 'no'; busy: boolean; targets: Target[] }>({ state: 'unknown', busy: false, targets: [] });

/** Chains where I am logged in and the owner has an account: [chain, owner's account there, my account there]. */
function plan(): Target[] {
  if (!USER) return [];
  const accounts: Record<string, string> = { [PRIMARY]: USER, ...(state.cfg.accounts ?? {}) };
  return Object.entries(accounts).flatMap(([chain, account]) => {
    const me = auth.sessions[chain]?.user;
    return me && me !== account ? [{ chain, account, me, yes: null as boolean | null }] : [];
  });
}
const summarize = (): void => {
  const known = follow.targets.filter((x) => x.yes !== null);
  follow.state = !known.length ? 'unknown' : known.every((x) => x.yes) ? 'yes' : 'no'; // 'no' also when only some chains follow: the button then completes the rest
};

let run = 0;
export async function loadFollow(): Promise<void> {
  const my = ++run;
  follow.targets = plan(); summarize();
  await Promise.all(follow.targets.map(async (x) => {
    const yes = await relationOn(x.chain, x.me, x.account);
    if (my === run) { x.yes = yes; summarize(); }
  }));
}

/** Follows (or unfollows) on every chain that is not already in that state. A chain that fails does not stop the others. */
export async function setFollow(on: boolean): Promise<void> {
  if (follow.busy) return;
  follow.busy = true;
  const done: string[] = [], failed: string[] = [];
  for (const x of follow.targets.filter((y) => y.yes !== on)) {
    try { await followOn(x.chain, x.me, x.account, on); x.yes = on; done.push(adapter(x.chain).name); }
    catch (e) { failed.push(`${adapter(x.chain).name} (${(e as Error).message || t('followFailed')})`); }
  }
  summarize();
  if (done.length) toast(t(on ? 'followOk' : 'unfollowOk', { u: `${USER} – ${done.join(', ')}` }));
  if (failed.length) toast(t('followFailed') + ': ' + failed.join(', '));
  if (done.length) { void reloadFeed(); void reloadWorldFeed(); } // the feed now includes / drops this blog
  follow.busy = false;
}
watch(() => [auth.me?.user, Object.values(auth.sessions).map((s) => s?.user).join(), JSON.stringify(state.cfg.accounts ?? {})], () => { void loadFollow(); }, { immediate: true });
