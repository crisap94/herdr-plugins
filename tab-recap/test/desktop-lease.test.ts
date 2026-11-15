import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '#src/adapters/db/database.ts';
import { DesktopBus } from '#src/adapters/desktop/bus.ts';
import { DesktopReads } from '#src/adapters/desktop/expanded.ts';
import { OpenLeases } from '#src/adapters/desktop/lease.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';

test('the bus counts, rings and resets', () => {
    let at = 10;
    const bus = new DesktopBus(() => instant(at), must(parseCount(3)));
    for (let n = 0; n < 5; n += 1) { at += 1; bus.publish('notice', null); }
    assert.equal(bus.current(), 5);
    assert.deepEqual(bus.since(must(parseCount(2))).events.map((event) => event.seq), [3, 4, 5]);
    assert.equal(bus.since(must(parseCount(1))).reset, 'yes');
    assert.equal(bus.since(must(parseCount(6))).reset, 'yes');
    assert.equal(bus.since(must(parseCount(5))).reset, 'no');
    assert.deepEqual(bus.since(must(parseCount(4))).events.map((event) => event.at), [15]);
});

test('watched() honours the lease next to the open marker, and the lease expires', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-lease-'));
    const dir = must(parseDirectory(join(root, 'gui')));
    const opened = openStore(join(root, 'tab-recap.db'));
    if (opened.kind !== 'ready') { throw new Error('store'); }
    let at = 1_000_000;
    const now = (): ReturnType<typeof instant> => instant(at);
    const leases = new OpenLeases(now);
    const reads = new DesktopReads({ store: opened, dir, republish: (): void => undefined, mode: 'daemon', now, leases });
    const tab = tabId('t1');
    assert.equal(reads.watched(tab, now()), 'no');
    leases.renew(tab);
    assert.equal(reads.watched(tab, now()), 'yes');
    at += 59_999;
    assert.equal(reads.watched(tab, now()), 'yes');
    at += 2;
    assert.equal(reads.watched(tab, now()), 'no');
    const fresh = tabId('t2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `open.${encodeURIComponent(fresh)}`), '');
    utimesSync(join(dir, `open.${encodeURIComponent(fresh)}`), new Date(at), new Date(at));
    assert.equal(reads.watched(fresh, now()), 'yes');
    at += 61_000;
    assert.equal(reads.watched(fresh, now()), 'no');
    opened.close();
});
