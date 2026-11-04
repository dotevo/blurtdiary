// Fails when a node / image host used by the code is missing from the CSP connect-src in index.html.
import { readFileSync, readdirSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
const connect = new Set((csp.match(/connect-src ([^;]+)/)?.[1] ?? '').split(/\s+/));
const used = new Set();
for (const f of readdirSync('src/lib/chains').filter((x) => x.endsWith('.ts'))) {
  for (const line of readFileSync(`src/lib/chains/${f}`, 'utf8').split('\n'))
    if (/_NODES\s*=|imageHost:/.test(line)) for (const m of line.matchAll(/'(https:\/\/[^'/]+)/g)) used.add(m[1]);
}
used.add('https://coal.blurtwallet.com');
const missing = [...used].filter((u) => !connect.has(u)), extra = [...connect].filter((u) => u.startsWith('https://') && !used.has(u));
if (missing.length) { console.error('Missing from connect-src:', missing.join(' ')); process.exit(1); }
if (extra.length) console.warn('In connect-src but not used by the code:', extra.join(' '));
console.log('CSP connect-src covers all', used.size, 'hosts');
