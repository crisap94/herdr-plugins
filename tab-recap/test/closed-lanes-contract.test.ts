import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClosedLanesRepository } from '#src/adapters/db/closed-lanes.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import type { ClosedLaneRecord, ClosureReader, ClosureRecorder, ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { ClosedLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { closedDaysOf as closedLaneDaysOf } from './fakes/closed-days.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { MemoryClosedLanes } from './fakes/closed-lanes-memory.ts';
import { directoryOf } from './fakes/closed-values.ts';

interface Harness {
    readonly recorder: ClosureRecorder;
    readonly reader: ClosureReader;
    readonly sweep: ClosureSweep;
    readonly seedTab: (tab: TabId) => void;
}

const DAY = 86_400_000;
const NOW = instant(Date.parse('2026-10-11T12:00:00Z'));
const FOURTEEN = closedLaneDaysOf('14');
const DISABLED = closedLaneDaysOf('0');
const TAB = tabId('w1:t1');
const OTHER = tabId('w1:t2');

function sqlite(days: ClosedLaneDays): Harness {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    const { db } = opened;
    const repository = new ClosedLanesRepository(db, days);
    return {
        recorder: repository,
        reader: repository,
        sweep: repository,
        seedTab: (tab: TabId): void => {
            db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run(tab);
        },
    };
}

function memory(days: ClosedLaneDays): Harness {
    const fake = new MemoryClosedLanes(days);
    return { recorder: fake, reader: fake, sweep: fake, seedTab: (): void => undefined };
}

const closure = (tab: TabId, pane: string, closedAt: Instant): ClosedLane => ({
    tab,
    pane: paneId(pane),
    agent: agentKind('claude'),
    since: null,
    cwd: directoryOf('/work'),
    closedAt,
});

function listedOf(harness: Harness, tab: TabId, now: Instant): readonly ClosedLaneRecord[] {
    const listed = harness.reader.listOf(tab, now);
    if (listed.kind !== 'listed') {
        throw new Error(`expected a listing, got ${listed.kind}`);
    }
    return listed.records;
}

function suite(name: string, make: (days: ClosedLaneDays) => Harness): void {
    test(`${name}: a recorded closure resolves to its agent and directory, with no association`, () => {
        const harness = make(FOURTEEN);
        harness.seedTab(TAB);
        harness.recorder.record(closure(TAB, 'w1:p1', NOW));
        assert.deepEqual(harness.reader.resolve({ tab: TAB, pane: paneId('w1:p1'), closedAt: NOW }), {
            kind: 'row',
            record: { tab: TAB, pane: paneId('w1:p1'), agent: agentKind('claude'), closedAt: NOW, cwd: directoryOf('/work'), association: null },
        });
    });

    test(`${name}: an identity never recorded is absent, and one millisecond off is not the same closure`, () => {
        const harness = make(FOURTEEN);
        harness.seedTab(TAB);
        harness.recorder.record(closure(TAB, 'w1:p1', NOW));
        assert.deepEqual(harness.reader.resolve({ tab: TAB, pane: paneId('w1:p1'), closedAt: instant(NOW - 1) }), { kind: 'absent' });
        assert.deepEqual(harness.reader.resolve({ tab: TAB, pane: paneId('w1:p9'), closedAt: NOW }), { kind: 'absent' });
    });

    test(`${name}: a repeated closure at the same instant is stored once`, () => {
        const harness = make(FOURTEEN);
        harness.seedTab(TAB);
        harness.recorder.record(closure(TAB, 'w1:p1', NOW));
        harness.recorder.record(closure(TAB, 'w1:p1', NOW));
        assert.equal(harness.sweep.countOf(TAB), 1);
    });

    test(`${name}: a pane closed twice is two identities, listed newest first`, () => {
        const harness = make(FOURTEEN);
        harness.seedTab(TAB);
        harness.recorder.record(closure(TAB, 'w1:p1', instant(NOW - 1000)));
        harness.recorder.record(closure(TAB, 'w1:p1', NOW));
        assert.deepEqual(listedOf(harness, TAB, NOW).map((record) => record.closedAt), [NOW, instant(NOW - 1000)]);
    });

    test(`${name}: the listing holds closures inside the window only, the cutoff itself included`, () => {
        const harness = make(FOURTEEN);
        harness.seedTab(TAB);
        const cutoff = instant(NOW - 14 * DAY);
        harness.recorder.record(closure(TAB, 'w1:p1', cutoff));
        harness.recorder.record(closure(TAB, 'w1:p2', instant(cutoff - 1)));
        assert.deepEqual(listedOf(harness, TAB, NOW).map((record) => record.pane), [paneId('w1:p1')]);
    });

    test(`${name}: protected tabs hold a closure inside the window; expired tabs and their pruning leave the others alone`, () => {
        const harness = make(FOURTEEN);
        harness.seedTab(TAB);
        harness.seedTab(OTHER);
        harness.recorder.record(closure(TAB, 'w1:p1', NOW));
        harness.recorder.record(closure(OTHER, 'w1:p1', instant(NOW - 20 * DAY)));
        assert.deepEqual(harness.sweep.protectedTabs(NOW), [TAB]);
        assert.deepEqual(harness.sweep.expiredTabs(NOW), [OTHER]);
        assert.equal(harness.sweep.pruneTab(OTHER, NOW), 1);
        assert.equal(harness.sweep.countOf(OTHER), 0);
        assert.deepEqual(harness.reader.resolve({ tab: OTHER, pane: paneId('w1:p1'), closedAt: instant(NOW - 20 * DAY) }), { kind: 'absent' });
        assert.equal(harness.sweep.countOf(TAB), 1);
    });

    test(`${name}: with the window at zero nothing is protected, listed, or kept after a prune`, () => {
        const harness = make(DISABLED);
        harness.seedTab(TAB);
        harness.recorder.record(closure(TAB, 'w1:p1', NOW));
        assert.deepEqual(harness.sweep.protectedTabs(NOW), []);
        assert.deepEqual(listedOf(harness, TAB, NOW), []);
        assert.deepEqual(harness.sweep.expiredTabs(NOW), [TAB]);
        assert.equal(harness.sweep.pruneTab(TAB, NOW), 1);
        assert.equal(harness.sweep.countOf(TAB), 0);
    });
}

suite('sqlite', sqlite);
suite('memory', memory);
