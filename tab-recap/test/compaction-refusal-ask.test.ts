import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { Compaction } from '#src/recap/application/compaction.ts';
import type { CompactionDeps } from '#src/recap/application/compaction.ts';
import { compactionPlans } from '#src/adapters/compaction-plan-registry.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { CompactRequests } from '#src/recap/application/compact-requests.ts';
import { targetOf } from '#src/recap/domain/compaction.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Agents, AgentState } from '#src/ports/agents.ts';
import type { LaneSettling } from '#src/ports/lane-settling.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { memoryStore } from './db/support.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';

const NOW = Date.parse('2026-10-10T10:00:00Z');
const LANE = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' });
const coordinator = must(toolName('coordinator'));
const board = (): Board => ({ ...emptyBoard(), seeded: true, lanes: new Map([[LANE.pane, LANE]]) });
const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

interface World {
    readonly compaction: Compaction;
    readonly asks: MemoryAskLedger;
    readonly tokens: RecordingTokens;
    readonly store: ReturnType<typeof memoryStore>;
}

function world(states: readonly AgentState[], answerOn: boolean): World {
    let reads = 0;
    const asks = new MemoryAskLedger();
    const tokens = new RecordingTokens();
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const handler = new CompactRequests({ enabled: (): boolean => true, board, requests: { requestCompact: (): void => undefined }, asks, tokens, now: (): number => NOW, log: (): void => undefined });
    asks.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid('r7'), pane: paneId('w1:p1'), at: NOW, ref: null });
    const agents: Agents = {
        status: (): Promise<AgentState> => {
            const state = states[Math.min(reads, states.length - 1)] ?? states[0];
            reads += 1;
            return Promise.resolve(state ?? unknown({ why: 'not-found', what: 'w1:p1' }));
        },
        prompt: () => Promise.resolve({ kind: 'sent' }),
        typeLine: () => Promise.resolve({ kind: 'sent' }),
        askNote: () => Promise.resolve({ kind: 'done' }),
    };
    const settling: LaneSettling = { settled: () => Promise.resolve({ kind: 'settled', status: 'done' }) };
    const deps: CompactionDeps = {
        compactionPlans,
        agents,
        notifier: { notify: () => Promise.resolve({ kind: 'shown' }) },
        records: { readRecap: () => blankRecap('w1:t1') },
        ledger: { historyOf: () => [] },
        boundaries: { lastBreakAt: () => null },
        compactions: store.compactions,
        settling,
        brief: { enabled: () => false, job: () => null, write: () => Promise.resolve({ text: null, why: null }) },
        coverage: () => null,
        decisions: null,
        answer: (id, pane, stage): void => { if (answerOn) { handler.answer(id, pane, stage); } },
        asks,
        claims: new CompactionClaims(),
        recent: () => Promise.resolve([]),
        marks: () => Promise.resolve([]),
        pause: () => Promise.resolve(),
        now: () => NOW,
        webs: { of: () => null },
        lanes: () => [LANE],
        focused: () => Promise.resolve('w1:p1'),
        refresh: () => Promise.resolve(),
        target: () => targetOf('focused'),
        messages: () => en,
        log: (): void => undefined,
    };
    return { compaction: new Compaction(deps), asks, tokens, store };
}

const REFUSALS: readonly (readonly [string, AgentState, string])[] = [
    ['a busy agent is refused failed-busy', { kind: 'agent', agent: 'claude', status: 'working' }, 'failed-busy'],
    ['a blocked agent is refused failed-skipped', { kind: 'agent', agent: 'claude', status: 'blocked' }, 'failed-skipped'],
    ['an agent whose state cannot be read is refused failed-error, never a slug of the reason', unknown({ why: 'unreadable', detail: 'agent cannot compact right now' }), 'failed-error'],
];

for (const [name, state, expected] of REFUSALS) {
    test(`a request on a lane that refuses: ${name}`, async () => {
        const run = world([state], true);
        await run.compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r7' });
        await flush();
        assert.deepEqual(run.tokens.reports.map((report) => report.tokens), [{ 'tab-recap-compact': `r7:${expected}` }]);
        assert.deepEqual(run.asks.unfinished(), []);
    });
}

test('an agent that turns busy while the brief is written is refused failed-busy, after running', async () => {
    const run = world([{ kind: 'agent', agent: 'claude', status: 'idle' }, { kind: 'agent', agent: 'claude', status: 'working' }], true);
    await run.compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r7' });
    await flush();
    assert.deepEqual(run.tokens.reports.map((report) => report.tokens), [{ 'tab-recap-compact': 'r7:running' }, { 'tab-recap-compact': 'r7:failed-busy' }]);
    assert.deepEqual(run.asks.unfinished(), []);
});

test('a refused request records its compaction as the ask\'s ref, so the ask names the compaction that answered it', async () => {
    const run = world([{ kind: 'agent', agent: 'claude', status: 'working' }], false);
    await run.compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'request', answer: 'r7' });
    assert.equal(run.store.db.prepare('SELECT id FROM compaction').all().length, 1);
    assert.match(run.asks.unfinished()[0]?.ref ?? '', /^cmp_/);
});
