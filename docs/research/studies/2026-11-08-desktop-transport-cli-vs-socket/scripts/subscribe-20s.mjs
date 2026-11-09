import net from 'node:net';
const s = net.connect('/run/user/1000/herdr-core/default.sock');
let buf = '', t0 = Date.now();
s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const j = JSON.parse(l); console.log(((Date.now()-t0)/1000).toFixed(1)+'s', j.id ?? '', j.method ?? 'reply', j.method ? JSON.stringify(j.params).slice(0, 160) : Object.keys(j.result ?? {}).join(',')); } });
s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'events.subscribe', params: {} }) + '\n');
setTimeout(() => { s.destroy(); process.exit(0); }, 20000);
