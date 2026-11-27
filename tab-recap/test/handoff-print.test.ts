import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrintedHandoffs } from '#src/recap/application/handoff-print.ts';
import type { PrintStore } from '#src/recap/application/handoff-print.ts';
import type { AgentLookup } from '#src/ports/agents.ts';
import type { PrintAsk } from '#src/ports/handoff-print.ts';
import type { LastRun, Recap } from '@stateforge-labs/session-ledger';
import type { TabViewRecord } from '#src/ports/tab-views.ts';
import type { ClosedLaneList, ClosedLaneRead } from '#src/ports/closed-lanes.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { closedDaysOf as closedLaneDaysOf } from './fakes/closed-days.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { CURSOR, FACTS, LAST_RUN, NOW, claudeReader, depsOf } from './fakes/handoff-pipeline-world.ts';
import { MemoryLedger } from './fakes/memory-ledger.ts';
import { recapOf, task } from './fakes/handoff-flow-harness.ts';
import { registryWith } from './fakes/transcript-registry.ts';
import { brand } from '@stateforge-labs/session-ledger';
import { viewRecord } from '#test/support/tab-view-records.ts';

const FROM = paneId('w1:p1');
const UNREACHABLE: AgentLookup = unknown({ why: 'unreachable', detail: causeOf('no herdr') });
const VIEW: TabViewRecord = viewRecord({ tab: 'w1:t1', column: null, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: '/repo' }], at: NOW });
const CLOSED_AT = instant(NOW - 1000);
const CLOSED_ROW: ClosedLaneRead = {
    kind: 'row',
    record: { tab: tabId('w1:t1'), pane: FROM, agent: agentKind('claude'), closedAt: CLOSED_AT, cwd: null, association: { task: { scope: tabId('w1:t1'), key: brand<string, 'Text'>('t1') }, name: null } },
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
            return { ...recapOf(task('t1', ['w1:p1'])), sessions: [CURSOR] };
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
