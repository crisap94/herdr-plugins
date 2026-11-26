import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { instant } from '@stateforge-labs/session-ledger';
import { must, parseDirectory } from '@stateforge-labs/session-ledger';
import { openStoreAt, type Store } from '#src/adapters/db/database.ts';
import { DesktopReads } from '#src/adapters/desktop/expanded.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { call, json, publishIndex, startRig, type Rig } from '#test/desktop-api-support.ts';
import { tabId } from '#test/support/ids.ts';

let rig: Rig;
let root: string;
let store: Store;
let reads: DesktopReads;

const now = (): ReturnType<typeof instant> => instant(rig.clock.at);
const watched = (tab: string): string => reads.watched(tabId(tab), now());

before(async () => {
    rig = await startRig();
    root = mkdtempSync(join(tmpdir(), 'e2e-77-store-'));
    const opened = openStoreAt(join(root, 'tab-recap.db') as FsPath);
    if (opened.kind !== 'ready') { throw new Error('store'); }
    store = opened;
    reads = new DesktopReads({ store, dir: must(parseDirectory(join(root, 'gui'))), republish: (): void => undefined, mode: 'daemon', now, leases: rig.leases });
    publishIndex(rig, ['t1']);
});

after(() => {
    rig.api.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
});

test('a tab nobody has opened is not watched', () => {
    assert.equal(watched('t1'), 'no');
});

test('opening the tab over the API makes it watched', { timeout: 30_000 }, async () => {
    assert.equal((await call(rig, 'PUT', '/v1/tabs/t1/open')).status, 204);
    assert.equal(watched('t1'), 'yes');
});

test('the lease still holds 59 seconds on and ends at 60', () => {
    rig.clock.at += 59_999;
    assert.equal(watched('t1'), 'yes');
    rig.clock.at += 2;
    assert.equal(watched('t1'), 'no');
});

test('closing the tab over the API drops the lease at once', { timeout: 30_000 }, async () => {
    await call(rig, 'PUT', '/v1/tabs/t1/open');
    assert.equal(watched('t1'), 'yes');
    assert.equal((await call(rig, 'DELETE', '/v1/tabs/t1/open')).status, 204);
    assert.equal(watched('t1'), 'no');
});

test('the event poll counts every publish and a since inside the ring answers with the later ones', { timeout: 30_000 }, async () => {
    const stamps: number[] = [];
    for (let n = 0; n < 5; n += 1) { rig.clock.at += 1; stamps.push(rig.clock.at); rig.bus.publish('notice', null); }
    const reply = await call(rig, 'GET', '/v1/events?since=2&wait=1');
    const body = JSON.parse(reply.text);
    assert.equal(body.seq, 5);
    assert.equal(body.reset, false);
    assert.deepEqual(body.events.map((event: { seq: number }) => event.seq), [3, 4, 5]);
    assert.deepEqual(body.events.map((event: { at: number }) => event.at), stamps.slice(2));
});

test('a since past the bus or before the ring answers with a reset', { timeout: 30_000 }, async () => {
    const future = json(await call(rig, 'GET', '/v1/events?since=6&wait=1')) as { reset: boolean; events: unknown[] };
    assert.deepEqual([future.reset, future.events], [true, []]);
    for (let n = 0; n < 700; n += 1) { rig.bus.publish('notice', null); }
    const old = json(await call(rig, 'GET', '/v1/events?since=1&wait=1')) as { reset: boolean; events: unknown[] };
    assert.deepEqual([old.reset, old.events], [true, []]);
    const edge = json(await call(rig, 'GET', '/v1/events?since=704&wait=1')) as { reset: boolean; events: unknown[] };
    assert.equal(edge.reset, false);
    assert.equal(edge.events.length, 1);
});
