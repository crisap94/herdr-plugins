import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrintedHandoffs } from '#src/recap/application/handoff-print.ts';
import type { PrintStore } from '#src/recap/application/handoff-print.ts';
import { renderHandoff } from '#src/recap/application/handoff-pipeline.ts';
import type { AgentState } from '#src/ports/agents.ts';
import type { PrintRequest, PrintResult } from '#src/ports/handoff-print.ts';
import type { LastRun, TabRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import type { ClosedLaneList, ClosedLaneRead } from '#src/ports/closed-lanes.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { closedLaneDaysOf } from '#src/recap/domain/retention.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { ID, CURSOR, FACTS, LAST_RUN, NOW, claudeReader, depsOf, inputOf, textOf } from './fakes/handoff-pipeline-world.ts';
import { MemoryLedger } from './fakes/memory-ledger.ts';
import { recapOf, task } from './fakes/handoff-flow-harness.ts';
import { registryWith } from './fakes/transcript-registry.ts';

const FROM = paneId('w1:p1');
const TO = paneId('w1:p2');
const UNREACHABLE: AgentState = unknown({ why: 'unreachable', detail: 'no herdr' });
const VIEW: TabView = { tab: 'w1:t1', column: null, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: '/repo' }], at: NOW };

interface Spy {
    opened: number;
    closed: number;
}

interface World {
    readonly tab?: string | null;
    readonly lastRun?: LastRun | null;
    readonly target?: AgentState;
}

function printerWith(spy: Spy, world: World = {}): PrintedHandoffs {
    const base = depsOf();
    const records: Pick<PrintStore['records'], 'readRecap' | 'lastRunOf'> = {
        readRecap: (): TabRecap => ({ ...recapOf(task('t1', ['w1:p1'])), lanes: [CURSOR] }),
        lastRunOf: (): LastRun | null => (world.lastRun === undefined ? LAST_RUN : world.lastRun),
    };
    const store = (): PrintStore => {
        spy.opened += 1;
        return {
            ledger: new MemoryLedger().seed(...FACTS),
            records,
            views: { tabOf: () => (world.tab === undefined ? 'w1:t1' : world.tab), readTab: () => VIEW },
            closures: { resolve: (): ClosedLaneRead => ({ kind: 'absent' }), listOf: (): ClosedLaneList => ({ kind: 'listed', records: [] }), runAt: (): LastRun | null => null },
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
        now: () => NOW,
    });
}

const request = (over: Partial<PrintRequest> = {}): PrintRequest => ({ from: FROM, to: null, note: null, closed: null, ...over });

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
    const printed = await printerWith(spy, { target: { kind: 'agent', agent: 'claude', status: 'working' } }).renderForPrint(request({ to: TO }));
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

test('print of a lane with no recap run is refused ledger-empty', async () => {
    const result: PrintResult = await printerWith({ opened: 0, closed: 0 }, { lastRun: null }).renderForPrint(request());
    assert.deepEqual(result, { kind: 'refused', reason: 'ledger-empty' });
});
