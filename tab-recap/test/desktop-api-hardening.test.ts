import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { DesktopApi } from '#src/adapters/desktop-api.ts';
import { DesktopBus } from '#src/adapters/desktop-bus.ts';
import { OpenLeases } from '#src/adapters/desktop-lease.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { instant } from '#src/recap/domain/time.ts';
import { call, startRig } from './desktop-api-support.ts';

const now = (): ReturnType<typeof instant> => instant(1);

test('a tab id naming a reserved file does not read it', async () => {
    const rig = await startRig();
    writeFileSync(join(rig.dir, 'index.json'), '{"version":1,"tabs":[]}');
    for (const name of ['api', 'index']) {
        assert.equal((await call(rig, 'GET', `/v1/tabs/${name}`)).status, 404);
    }
    rig.api.close();
});

test('a discovery file that cannot be written is a failure value, not a crash', async () => {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'desktop-api-bad-'))));
    mkdirSync(join(dir, 'api.json', 'blocker'), { recursive: true });
    const api = new DesktopApi({ dir, bus: new DesktopBus(now), leases: new OpenLeases(now), requests: { request: (): void => undefined }, now }, () => undefined);
    const started = await api.listen();
    assert.equal(started.kind, 'err');
    api.close();
});

test('an unparseable request target is 400, not 500', async () => {
    const rig = await startRig();
    const status = await new Promise<number>((resolve, reject) => {
        const sent = request({ host: '127.0.0.1', port: rig.port, method: 'GET', path: 'http://', headers: { host: `127.0.0.1:${rig.port}`, authorization: `Bearer ${rig.token}` }, agent: false }, (response) => { resolve(response.statusCode ?? 0); response.resume(); });
        sent.on('error', reject);
        sent.end();
    });
    assert.equal(status, 400);
    rig.api.close();
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('a client that disconnects leaves no waiter, timer or listener on the bus', async () => {
    const rig = await startRig();
    try {
        const gone = new AbortController();
        const held = call(rig, 'GET', '/v1/events?since=0&wait=25', { signal: gone.signal });
        held.catch(() => undefined);
        await sleep(100);
        assert.equal(rig.bus.waiting(), 1);
        gone.abort();
        await sleep(100);
        assert.equal(rig.bus.waiting(), 0);
    } finally { rig.api.close(); }
});

test('wait is capped at 28 seconds', async () => {
    const holds: number[] = [];
    class Spy extends DesktopBus {
        override wait(seen: Parameters<DesktopBus['wait']>[0], hold: Parameters<DesktopBus['wait']>[1], gone: AbortSignal): ReturnType<DesktopBus['wait']> {
            holds.push(hold);
            return Promise.resolve(this.since(seen));
        }
    }
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'desktop-api-cap-'))));
    const api = new DesktopApi({ dir, bus: new Spy(now), leases: new OpenLeases(now), requests: { request: (): void => undefined }, now }, () => undefined);
    try {
        await api.listen();
        const found = JSON.parse(readFileSync(join(dir, 'api.json'), 'utf8'));
        const get = (query: string): Promise<Response> => fetch(`http://127.0.0.1:${found.port}/v1/events${query}`, { headers: { authorization: `Bearer ${found.token}` } });
        await get('?wait=100');
        await get('');
        await get('?wait=3');
        assert.deepEqual(holds, [28_000, 25_000, 3_000]);
    } finally { api.close(); }
});

test('stopping leaves a discovery file that another daemon wrote', async () => {
    const rig = await startRig();
    writeFileSync(join(rig.dir, 'api.json'), JSON.stringify({ version: 1, port: 1, token: 'someone-else', pid: 1, startedAt: 1 }));
    rig.api.close();
    assert.equal(JSON.parse(readFileSync(join(rig.dir, 'api.json'), 'utf8')).token, 'someone-else');
});
