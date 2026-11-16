/* Runs only inside the sandboxed iframe of feed-frame.html. No keys, no storage, no DOM work: GET → text → postMessage to the parent. */
const MAX = 3000000, TIMEOUT = 15000, MAX_IMG = 10 * 1024 * 1024;
addEventListener('message', async (e) => {
  if (e.source !== parent) return;
  const id = e.data && e.data.id; const reply = (o) => parent.postMessage({ id, ...o }, '*');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const u = new URL(String(e.data.url));
    if (u.protocol !== 'https:' || u.username || u.password) return reply({ error: 'bad-url' });
    if (e.data.kind === 'image') { // a picture to copy to the chain's image host: bytes back, raster types only (no SVG)
      const ri = await fetch(u.href, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!ri.ok) return reply({ error: 'http', status: ri.status });
      const blob = await ri.blob();
      if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(blob.type)) return reply({ error: 'not-image' });
      if (blob.size > MAX_IMG) return reply({ error: 'too-large' });
      return reply({ blob });
    }
    const r = await fetch(u.href, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5' } });
    if (!r.ok) return reply({ error: 'http', status: r.status });
    const text = await r.text();
    if (text.length > MAX) return reply({ error: 'too-large' });
    reply({ text });
  } catch (err) { reply({ error: err && err.name === 'AbortError' ? 'timeout' : 'network' }); } finally { clearTimeout(timer); }
});
parent.postMessage({ ready: true }, '*');
