import net from 'node:net';
import { spawn } from 'node:child_process';
const SOCK = process.env.XDG_RUNTIME_DIR + '/herdr-core/default.sock';
const N = 50;
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, median: +s[Math.floor(s.length / 2) - (s.length % 2 ? 0 : 0)].toFixed(2), p95: +s[Math.ceil(s.length * 0.95) - 1].toFixed(2), min: +s[0].toFixed(2), max: +s[s.length - 1].toFixed(2) }; };
const cli = (args) => new Promise((res) => { const t = performance.now(); const p = spawn('hc', args, { stdio: ['ignore', 'pipe', 'ignore'] }); let b = 0; p.stdout.on('data', (d) => (b += d.length)); p.on('close', () => res([performance.now() - t, b])); });
const s = net.connect(SOCK); let buf = ''; let pend = null;
s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const m = JSON.parse(l); const r = pend; pend = null; r?.([m, l.length]); } });
await new Promise((r) => s.once('connect', r));
let id = 0; const call = (method, params = {}) => new Promise((r) => { pend = r; s.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n'); });
const sock = async (m, p) => { const t = performance.now(); const [, n] = await call(m, p); return [performance.now() - t, n]; };
const out = {};
for (const [label, args, m, p] of [['list', ['ls', '--json'], 'terminal.list', {}], ['get', ['get', 't6', '--json'], 'terminal.get', { terminal: 't6' }]]) {
  await cli(args); await sock(m, p);
  const c = [], k = [], cb = [], kb = [];
  for (let i = 0; i < N; i++) { const [t, b] = await cli(args); c.push(t); cb.push(b); }
  for (let i = 0; i < N; i++) { const [t, b] = await sock(m, p); k.push(t); kb.push(b); }
  out[label] = { cli_ms: stats(c), socket_ms: stats(k), cli_bytes: cb[0], socket_bytes: kb[0] };
}
const t0 = performance.now(); const s2 = net.connect(SOCK); await new Promise((r) => s2.once('connect', r)); out.connect_ms = +(performance.now() - t0).toFixed(2); s2.destroy(); s.destroy();
console.log(JSON.stringify(out, null, 1));
