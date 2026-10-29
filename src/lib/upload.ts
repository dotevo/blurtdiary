/**
 * Image upload – same signing scheme on every chain's image host: SHA-256 of "ImageSigningChallenge"+bytes, signed with the
 * posting key of the account on THAT chain, POSTed to <host>/<account>/<signature>.
 * Each chain gets its own copy of an image, so a post stays intact even if one host drops the file.
 */
import * as dblurt from '@beblurt/dblurt';
import { auth, wvSign } from './auth';
import { adapter, CHAINS, PRIMARY } from './chains';
import { t } from './i18n';

const MAX_BYTES = 10 * 1024 * 1024;
/** Image URL on the primary chain's host -> the same image's URL per other chain. */
export type ImageMap = Record<string, Record<string, string>>;
const MD_IMG = /(!\[[^\]]*\]\()(https?:[^)\s]+)/g;

/** Uploads `file` to one chain's image host with that chain's session. */
export async function uploadImage(file: File, chain: string = PRIMARY): Promise<string> {
  const me = auth.sessions[chain], host = adapter(chain).imageHost;
  if (!me) throw new Error(t('needLogin'));
  if (!host) throw new Error(t('uploadFailed'));
  if (!file.type.startsWith('image/')) throw new Error(t('uploadFailed'));
  if (file.size > MAX_BYTES) throw new Error(t('uploadFailed') + ' (>10 MB)');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const prefix = new TextEncoder().encode('ImageSigningChallenge');
  const combined = new Uint8Array(prefix.length + bytes.length);
  combined.set(prefix, 0); combined.set(bytes, prefix.length);

  let sig: string;
  if (me.type === 'key') {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
    sig = dblurt.PrivateKey.from(me.key!).sign(hash as never).toString();
  } else {
    const r = await wvSign(chain, me.user, JSON.stringify({ type: 'Buffer', data: Array.from(combined) }), '');
    if (!r.success) throw new Error(r.message || t('wvError'));
    let s = (r.result ?? '').split(':')[0];
    if (s.startsWith('SIG_K1_')) { try { s = dblurt.Signature.fromString(s).toString(); } catch { /* keep as is */ } }
    sig = s;
  }
  const form = new FormData(); form.append('file', file);
  const resp = await fetch(`${host}/${me.user}/${sig}`, { method: 'POST', body: form });
  if (!resp.ok) throw new Error(`${t('uploadFailed')}: ${resp.status}`);
  const data = (await resp.json()) as { url?: string };
  if (!data.url) throw new Error(t('uploadFailed'));
  return data.url;
}

/**
 * Uploads to Blurt (required – its URL goes into the editor) and, in parallel, to every other chain the author is logged in to.
 * Failures on the other chains are reported, not thrown: the image is still usable from Blurt's host there.
 */
export async function uploadEverywhere(file: File): Promise<{ url: string; others: Record<string, string>; failed: string[] }> {
  const others: Record<string, string> = {}, failed: string[] = [];
  const [url] = await Promise.all([
    uploadImage(file, PRIMARY),
    ...CHAINS.filter((c) => c.id !== PRIMARY && auth.sessions[c.id] && c.imageHost).map(async (c) => {
      try { others[c.id] = await uploadImage(file, c.id); } catch (e) { console.warn('image upload failed on', c.id, e); failed.push(c.name); }
    }),
  ]);
  return { url, others, failed };
}

/**
 * Body for `chain`: each Blurt image URL is replaced by that chain's own copy.
 * Known copies come from `known` (made when the image was uploaded in the editor). Images without a known copy are
 * downloaded and re-uploaded on a best-effort basis (hosts may refuse cross-origin reads); on any failure the original URL stays.
 */
export async function localizeBody(chain: string, body: string, known: ImageMap = {}): Promise<string> {
  if (chain === PRIMARY) return body;
  const a = adapter(chain);
  const urls = [...new Set([...body.matchAll(MD_IMG)].map((m) => m[2]))];
  const map: Record<string, string> = {};
  await Promise.all(urls.map(async (u) => {
    if (known[u]?.[chain]) { map[u] = known[u][chain]; return; }
    let host = ''; try { host = new URL(u).host; } catch { return; }
    if (a.imageHosts.includes(host) || !a.imageHost || !auth.sessions[chain]) return; // already on this chain's host / cannot upload
    try {
      const r = await fetch(u); if (!r.ok) return;
      const blob = await r.blob();
      map[u] = await uploadImage(new File([blob], 'image', { type: blob.type || 'image/jpeg' }), chain);
    } catch (e) { console.warn('image copy failed for', chain, u, e); }
  }));
  return body.replace(MD_IMG, (_m, pre: string, u: string) => pre + (map[u] ?? u));
}
