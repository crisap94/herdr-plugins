import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurateTasks } from '#src/recap/application/curate.ts';
import type { CurateDeps } from '#src/recap/application/curate.ts';
import { PrintedHandoffs } from '#src/recap/application/handoff-print.ts';
import type { PrintStore } from '#src/recap/application/handoff-print.ts';
import type { GuardedLedger } from '#src/ports/guarded-reads.ts';
import type { Curators } from '#src/ports/curators.ts';
import type { ClosedLaneList, ClosedLaneRead } from '#src/ports/closed-lanes.ts';
import type { LastRun } from '#src/ports/recap-records.ts';
import type { Stories } from '#src/ports/stories.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { TaskId } from '#src/recap/domain/fact.ts';
import { cursor, memoryStore, recordOps, storeRead } from './db/support.ts';
import { causeOf } from './fakes/cause.ts';
import { closedDaysOf } from './fakes/closed-days.ts';
import { claudeReader, depsOf } from './fakes/handoff-pipeline-world.ts';
import { registryWith } from './fakes/transcript-registry.ts';
import { oneTask, withFacts } from './support.ts';

const NOW = Date.parse('2026-10-11T10:00:00Z');
const TAB = tabId('w1:t1');
const T1: TaskId = { tab: TAB, key: 't1' };
const LOCKED = unknown({ why: 'unreadable', detail: causeOf('locked') });
const SECTIONS = { goal: 'Ship retries', now: [], needs: [], done: ['Merged !256.'], decisions: [], next: [], links: [], rules: [] };
const VIEW: TabView = { tab: TAB, column: null, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: '/repo' }], at: NOW };

interface Probe {
    writes: number;
    keeps: number;
    logs: string[];
}

function seeded(): ReturnType<typeof memoryStore> {
    const store = memoryStore();
    recordOps(store, { tab: TAB, at: 5, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], ...withFacts(oneTask('', SECTIONS)), input: '<recap_input version="1"/>' });
    return store;
}

function ledgerOf(store: ReturnType<typeof memoryStore>, over: Partial<GuardedLedger> = {}): GuardedLedger {
    return {
        openOf: (task) => store.ledger.openOf(task),
        recentlyClosed: (task, since) => store.ledger.recentlyClosed(task, since),
        allOf: (task) => store.ledger.allOf(task),
        keysOf: (tab) => store.ledger.keysOf(tab),
        historyOf: (tab, pane) => store.ledger.historyOf(tab, pane),
        ...over,
    };
}

function curatorOf(store: ReturnType<typeof memoryStore>, ledger: GuardedLedger, probe: Probe): CurateTasks {
    const writer: Curators = {
        backend: 'fake/test',
        write: () => {
            probe.writes += 1;
            return Promise.resolve({ kind: 'curated', text: '{"story":"Written anyway."}' });
        },
    };
    const stories: Stories = {
        read: () => null,
        keep: () => {
            probe.keeps += 1;
            return { changed: [], refused: [] };
        },
    };
    const deps: CurateDeps = {
        records: store.records,
        ledger,
        stories,
        writer: () => writer,
        clock: () => NOW,
        zone: () => 'UTC',
        language: () => 'en',
        rubric: '',
        tail: () => Promise.resolve([]),
        log: (line) => { probe.logs.push(line); },
    };
    return new CurateTasks(deps);
}

test('an unknown fact read curates nothing: no writer call, no story, no fact closed', async () => {
    const store = seeded();
    const open = storeRead(store.ledger.openOf(T1)).length;
    const probe: Probe = { writes: 0, keeps: 0, logs: [] };
    await curatorOf(store, ledgerOf(store, { allOf: () => LOCKED }), probe).run(TAB);
    assert.ok(open > 0, 'the seeded task has open facts');
    assert.deepEqual([probe.writes, probe.keeps], [0, 0]);
    assert.equal(storeRead(store.ledger.openOf(T1)).length, open, 'every open fact is still open');
    assert.equal(probe.logs.length, 1);
    assert.match(probe.logs[0] ?? '', /facts not read/u);
});

test('a store that cannot be read at all leaves curation idle and writes nothing', async () => {
    const store = seeded();
    store.db.close();
    const probe: Probe = { writes: 0, keeps: 0, logs: [] };
    await curatorOf(store, ledgerOf(store), probe).run(TAB);
    assert.deepEqual([probe.writes, probe.keeps, probe.logs], [0, 0, []]);
});

test('a handoff over an unreadable store is reported unreadable, not as an empty ledger', async () => {
    const store = seeded();
    store.db.close();
    const logged: string[] = [];
    const base = depsOf();
    const closedNone: ClosedLaneRead = { kind: 'absent' };
    const listed: ClosedLaneList = { kind: 'listed', records: [] };
    const printer = new PrintedHandoffs({
        openStore: (): PrintStore => ({
            ledger: ledgerOf(store),
            records: store.records,
            views: { tabOf: () => TAB, readTab: () => VIEW },
            closures: {
                resolve: () => closedNone,
                listOf: () => listed,
                runAt: (): LastRun | null => null,
            },
            close: () => undefined,
        }),
        transcripts: registryWith({ claude: claudeReader(2) }),
        worksite: base.worksite,
        tokens: base.tokens,
        target: { status: async (): Promise<never> => { throw new Error('the target is not asked'); } },
        closedDays: closedDaysOf('14'),
        now: (): number => NOW,
        flush: (): Promise<void> => Promise.resolve(),
        log: (line: string): void => { logged.push(line); },
    });
    const printed = await printer.renderForPrint({ from: paneId('w1:p1'), to: null, note: null, closed: null });
    assert.deepEqual(printed, { kind: 'failed', reason: 'source-unreadable' });
    assert.equal(logged.length, 1);
    assert.match(logged[0] ?? '', /source unreadable/u);
});
