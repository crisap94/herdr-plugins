import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, type Store } from '#src/adapters/db/database.ts';
import { desktopFrontend } from '#src/adapters/desktop-frontend.ts';
import { DesktopBus } from '#src/adapters/desktop-bus.ts';
import { GuiPublisher } from '#src/adapters/gui-publisher.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { blankRecap, type RecapRecords, type TabRecap } from '#src/ports/recap-records.ts';
import type { TabViews } from '#src/ports/tab-views.ts';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function stateStore(): { root: string; store: Store } {
    const root = mkdtempSync(join(tmpdir(), 'desktop-wire-'));
    const opened = openStore(join(root, 'tab-recap.db'));
    if (opened.kind !== 'ready') { throw new Error('store'); }
    return { root, store: opened };
}

async function appears(path: string): Promise<boolean> {
    for (let n = 0; n < 100 && !existsSync(path); n += 1) { await sleep(20); }
    return existsSync(path);
}

function reachable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connect(port, '127.0.0.1');
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error', () => { resolve(false); });
    });
}

test('the desktop frontend starts the API with the store and stops it before the store closes', async () => {
    const { root, store } = stateStore();
    process.env['TAB_RECAP_STATE'] = root;
    delete process.env['TAB_RECAP_API'];
    const wrapped = desktopFrontend().wrap(store, () => undefined);
    const path = join(root, 'gui', 'api.json');
    assert.ok(await appears(path));
    const found = JSON.parse(readFileSync(path, 'utf8'));
    const reply = await fetch(`http://127.0.0.1:${found.port}/v1/health`, { headers: { authorization: `Bearer ${found.token}` } });
    assert.equal(reply.status, 200);
    assert.ok(await reachable(found.port));
    wrapped.close();
    await sleep(100);
    assert.equal(existsSync(path), false);
    assert.equal(await reachable(found.port), false);
});

test('TAB_RECAP_API=off starts nothing', async () => {
    const { root, store } = stateStore();
    process.env['TAB_RECAP_STATE'] = root;
    process.env['TAB_RECAP_API'] = 'off';
    const wrapped = desktopFrontend().wrap(store, () => undefined);
    await sleep(300);
    assert.equal(existsSync(join(root, 'gui', 'api.json')), false);
    wrapped.close();
    delete process.env['TAB_RECAP_API'];
});

test('the publisher feeds the bus after each file write and leaves api.json alone', () => {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'desktop-pub-'))));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'api.json'), '{"keep":true}');
    const bus = new DesktopBus((): Instant => instant(1));
    const records = { readRecap: (tab: string): TabRecap => ({ ...blankRecap(tab), at: 1000, backend: 'custom' }) } as unknown as RecapRecords;
    const views: TabViews = { readTab: (): null => null, writeTab: (): void => undefined, tabOf: (): null => null };
    const publisher = new GuiPublisher({ dir, records, views, now: (): Instant => instant(5), log: (): void => undefined, bus });
    publisher.publish(tabId('t1'));
    publisher.publish(tabId('t2'));
    assert.deepEqual(bus.since(must(parseCount(0))).events.map((event) => [event.topic, event.tab]), [['tab', 't1'], ['index', null], ['tab', 't2'], ['index', null]]);
    assert.equal(readFileSync(join(dir, 'api.json'), 'utf8'), '{"keep":true}');
});
