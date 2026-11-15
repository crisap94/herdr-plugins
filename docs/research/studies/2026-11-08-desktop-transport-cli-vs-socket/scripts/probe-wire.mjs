import net from 'node:net';
const SOCK = process.env.XDG_RUNTIME_DIR + '/herdr-core/default.sock';
const out = (k, v) => console.log('### ' + k + '\n' + (typeof v === 'string' ? v : JSON.stringify(v)));
function once(payload, ms = 1500) {
  return new Promise((res) => {
    const s = net.connect(SOCK); const chunks = [];
    s.on('connect', () => payload.forEach((p) => s.write(p)));
    s.on('data', (d) => chunks.push(d));
    s.on('error', (e) => chunks.push(Buffer.from('ERR ' + e.message)));
    setTimeout(() => { s.destroy(); res(Buffer.concat(chunks)); }, ms);
  });
}
const j = (o) => JSON.stringify(o) + '\n';
let b = await once([j({ jsonrpc: '2.0', id: 1, method: 'hello', params: {} })]);
out('hello line, raw utf8', b.toString()); out('hello raw hex head', b.subarray(0, 24).toString('hex'));
b = await once([j({ jsonrpc: '2.0', id: 1, method: 'hello', params: {} }), j({ jsonrpc: '2.0', id: 2, method: 'server.status' })]);
out('hello+status pipelined', b.toString());
b = await once([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server.status' })]);
out('no newline sent (1.5s)', b.toString() || '(no reply)');
b = await once([j({ id: 1, method: 'server.status' })]);
out('no jsonrpc field', b.toString());
b = await once([j({ jsonrpc: '2.0', id: 1, method: 'hello', params: { framed: true } }), j({ jsonrpc: '2.0', id: 2, method: 'server.status' })]);
out('hello framed:true then NDJSON status, raw hex', b.toString('hex')); out('as latin1', b.toString('latin1'));
const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'server.status' }));
const hdr = Buffer.alloc(4); hdr.writeUInt32BE(body.length);
b = await once([j({ jsonrpc: '2.0', id: 1, method: 'hello', params: { framed: true } }), Buffer.concat([hdr, body])]);
out('framed:true then u32be-length frame', b.toString('latin1')); out('hex', b.toString('hex'));
b = await once([j({ jsonrpc: '2.0', id: 1, method: 'hello', params: { framed: true } }), Buffer.concat([Buffer.from(String(body.length) + '\n'), body])]);
out('framed:true then "<len>\\n"+body', b.toString('latin1'));
