import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrintedHandoffs } from '#src/recap/application/handoff-print.ts';
import type { PrintStore } from '#src/recap/application/handoff-print.ts';
import { renderHandoff } from '#src/recap/application/handoff-pipeline.ts';
import type { AgentLookup } from '#src/ports/agents.ts';
import type { PrintAsk, PrintAnswer } from '#src/ports/handoff-print.ts';
import type { LastRun, Recap } from '#src/ports/recap-records.ts';
import type { TabViewRecord } from '#src/ports/tab-views.ts';
import type { ClosedLaneList, ClosedLaneRead } from '#src/ports/closed-lanes.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { causeOf } from './fakes/cause.ts';
import { closedDaysOf as closedLaneDaysOf } from './fakes/closed-days.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import { instant } from '#src/recap/domain/time.ts';
import { ID, CURSOR, FACTS, LAST_RUN, NOW, claudeReader, depsOf, inputOf, textOf } from './fakes/handoff-pipeline-world.ts';
import { MemoryLedger } from './fakes/memory-ledger.ts';
import { recapOf, task } from './fakes/handoff-flow-harness.ts';
import { registryWith } from './fakes/transcript-registry.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';

const FROM = paneId('w1:p1');
const TO = paneId('w1:p2');
const UNREACHABLE: AgentLookup = unknown({ why: 'unreachable', detail: causeOf('no herdr') });
const VIEW: TabViewRecord = viewRecord({ tab: 'w1:t1', column: null, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: '/repo' }], at: NOW });
const CLOSED_AT = instant(NOW - 1000);
const CLOSED_ROW: ClosedLaneRead = {
    kind: 'row',
    record: { tab: tabId('w1:t1'), pane: FROM, agent: agentKind('claude'), closedAt: CLOSED_AT, cwd: null, association: { task: { tab: tabId('w1:t1'), key: brand<string, 'Text'>('t1') }, name: null } },
};
const locked = (): Error => Object.assign(new Error('/home/coder/secret/db.sqlite is locked'), { name: 'SqliteError', code: 'SQLITE_BUSY' });

interface Spy {
    opened: number;
    closed: number;
}

interface World {
    readonly tab?: string | null;
    readonly lastRun?: LastRun | null;
    readonly target?: AgentLookup;
    readonly unreadable?: boolean;
    readonly closedUnreadable?: boolean;
}

function printerWith(spy: Spy, world: World = {}, logged: string[] = [], flushed: string[] = []): PrintedHandoffs {
    const base = depsOf();
    const records: Pick<PrintStore['records'], 'readRecap' | 'lastRunOf'> = {
        readRecap: (): Recap => {
            if (world.unreadable === true) {
                throw locked();
            }
            return { ...recapOf(task('t1', ['w1:p1'])), lanes: [CURSOR] };
        },
        lastRunOf: (): LastRun | null => (world.lastRun === undefined ? LAST_RUN : world.lastRun),
    };
    const store = (): PrintStore => {
        spy.opened += 1;
        return {
            ledger: new MemoryLedger().seed(...FACTS),
            records,
            views: { tabOf: () => (world.tab === null ? null : tabId(world.tab ?? 'w1:t1')), readTab: () => VIEW },
            closures: {
                resolve: (): ClosedLaneRead => (world.closedUnreadable === true ? CLOSED_ROW : { kind: 'absent' }),
                listOf: (): ClosedLaneList => ({ kind: 'listed', records: [] }),
                runAt: (): LastRun | null => {
                    if (world.closedUnreadable === true) {
                        throw locked();
                    }
                    return null;
                },
            },
            close: (): void => { spy.closed += 1; },
        };
    };
    return new PrintedHandoffs({
        openStore: store,
        transcripts: registryWith({ claude: claudeReader(2) }),
        worksite: base.worksite,
        tokens: base.tokens,
        target: { status: async () => world.target ?? UNREACHABLE },
        closedDays: closedLaneDaysOf('14'),
        now: () => instant(NOW),
        flush: (tab, why): Promise<void> => { flushed.push(`${String(tab)} ${why} opened ${spy.opened}`); return Promise.resolve(); },
        log: (line) => { logged.push(line); },
    });
}

const request = (over: Partial<PrintAsk> = {}): PrintAsk => ({ from: FROM, to: null, note: null, closed: null, ...over });

const bodyOf = (text: string): string => text.replace(/^Handoff reference: .*$/m, '');

test('print renders the same body the daemon renders, under the dry-run reference', async () => {
    const spy: Spy = { opened: 0, closed: 0 };
    const printed = await printerWith(spy).renderForPrint(request());
    assert.ok(printed.kind === 'text');
    assert.match(printed.text, /^Handoff reference: dry run$/m);
    assert.equal(bodyOf(printed.text), bodyOf(await textOf(await renderHandoff(depsOf())(inputOf({ handoff: ID })))));
    assert.deepEqual(printed.info, null);
    assert.deepEqual([spy.opened, spy.closed], [1, 1]);
});

test('print with --to puts the target status on the information channel and still renders', async () => {
    const spy: Spy = { opened: 0, closed: 0 };
    const printed = await printerWith(spy, { target: { kind: 'agent', agent: agentKind('claude'), status: 'working' } }).renderForPrint(request({ to: TO }));
    assert.ok(printed.kind === 'text');
    assert.equal(printed.info, 'target w1:p2: working');
});

test('print with --to and no herdr reports no target status and does not refuse', async () => {
    const printed = await printerWith({ opened: 0, closed: 0 }).renderForPrint(request({ to: TO }));
    assert.deepEqual([printed.kind, printed.kind === 'text' ? printed.info : null], ['text', null]);
});

test('print refuses the same lane before it opens the store', async () => {
    const spy: Spy = { opened: 0, closed: 0 };
    assert.deepEqual(await printerWith(spy).renderForPrint(request({ to: FROM })), { kind: 'refused', reason: 'source-equals-target' });
    assert.deepEqual([spy.opened, spy.closed], [0, 0]);
});

test('print refuses a source that no tab lists with source-unavailable and closes the store', async () => {
    const spy: Spy = { opened: 0, closed: 0 };
    assert.deepEqual(await printerWith(spy, { tab: null }).renderForPrint(request()), { kind: 'refused', reason: 'source-unavailable' });
    assert.deepEqual([spy.opened, spy.closed], [1, 1]);
});

test('print of a source that cannot be read fails source-unreadable and logs the cause code only', async () => {
    const spy: Spy = { opened: 0, closed: 0 };
    const logged: string[] = [];
    assert.deepEqual(await printerWith(spy, { unreadable: true }, logged).renderForPrint(request()), { kind: 'failed', reason: 'source-unreadable' });
    assert.deepEqual(logged, ['handoff print: source unreadable (SqliteError: SQLITE_BUSY)']);
    assert.deepEqual([spy.opened, spy.closed], [1, 1]);
});

test('print of a closed source whose store cannot be read fails source-unreadable and logs the cause code only', async () => {
    const spy: Spy = { opened: 0, closed: 0 };
    const logged: string[] = [];
    const closed: ClosedLaneIdentity = { tab: tabId('w1:t1'), pane: FROM, closedAt: CLOSED_AT };
    assert.deepEqual(await printerWith(spy, { closedUnreadable: true }, logged).renderForPrint(request({ closed })), { kind: 'failed', reason: 'source-unreadable' });
    assert.deepEqual(logged, ['handoff print: source unreadable (SqliteError: SQLITE_BUSY)']);
    assert.deepEqual([spy.opened, spy.closed], [1, 1]);
});

test('print of a lane with no recap run is refused ledger-empty', async () => {
    const result: PrintAnswer = await printerWith({ opened: 0, closed: 0 }, { lastRun: null }).renderForPrint(request());
    assert.deepEqual(result, { kind: 'refused', reason: 'ledger-empty' });
});

test('print flushes the pending recap of the live or closed source tab after it opens the store and before it reads', async () => {
    const flushed: string[] = [];
    const live = await printerWith({ opened: 0, closed: 0 }, {}, [], flushed).renderForPrint(request());
    assert.equal(live.kind, 'text');
    const closed: ClosedLaneIdentity = { tab: tabId('w1:t1'), pane: FROM, closedAt: CLOSED_AT };
    await printerWith({ opened: 0, closed: 0 }, { closedUnreadable: true }, [], flushed).renderForPrint(request({ closed }));
    assert.deepEqual(flushed, ['w1:t1 handoff print opened 1', 'w1:t1 handoff print opened 1']);
});

test('a print refused before the store opens flushes nothing', async () => {
    const flushed: string[] = [];
    await printerWith({ opened: 0, closed: 0 }, {}, [], flushed).renderForPrint(request({ to: FROM }));
    assert.deepEqual(flushed, []);
});
