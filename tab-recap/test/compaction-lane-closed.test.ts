import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Compaction } from '#src/recap/application/compaction.ts';
import type { CompactionDeps } from '#src/recap/application/compaction.ts';
import type { Coverage } from '#src/recap/application/brief-coverage.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { AgentState, Agents } from '#src/ports/agents.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { compactionDeps, compacted, typingFleet } from '#test/fakes/compaction-fleet.ts';
import type { Fleet } from '#test/fakes/compaction-fleet.ts';

interface Hostile {
    readonly world: Fleet;
    readonly calls: { writer: number; coverage: number; rewrites: number };
    readonly logs: string[];
    readonly board: { listed: boolean };
    readonly compaction: Compaction;
}

interface Steps {
    readonly closesIn?: 'writer' | 'coverage';
    readonly coverage?: Coverage;
    readonly statuses?: readonly AgentState[];
    readonly lanes?: boolean;
}

const MISSING: Coverage = { ok: false, missing: ['the goal'], missingFacts: [{ index: 0, fact: { section: 'goal', text: 'Ship it', why: null }, parts: [] }], answers: {}, unknown: null };
const PASSING: Coverage = { ok: true, missing: [], missingFacts: [], answers: {}, unknown: null };
const IDLE: AgentState = { kind: 'agent', agent: 'claude', status: 'idle' };
const AUTO: CompactRequest = { tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto', answer: 'r1' };

function hostile(steps: Steps = {}): Hostile {
    const world = typingFleet({ 'w1:p1': 'idle' });
    const calls = { writer: 0, coverage: 0, rewrites: 0 };
    const logs: string[] = [];
    const board = { listed: true };
    const states = [...(steps.statuses ?? [])];
    const agents: Agents = { ...world.agents, status: () => Promise.resolve(states.shift() ?? IDLE) };
    const base = compactionDeps({ ...world, agents }, 'focused', 'w1:p1', [[compacted]]);
    const deps: CompactionDeps = {
        ...base,
        listsPane: () => board.listed,
        brief: {
            enabled: () => true,
            job: () => 'writer',
            write: (_document, _own, correction) => {
                if (correction === undefined) calls.writer += 1; else calls.rewrites += 1;
                if (steps.closesIn === 'writer' && correction === undefined) board.listed = false;
                return Promise.resolve({ text: 'Ship the cart rewrite.', why: null });
            },
        },
        coverage: () => ({
            check: () => {
                calls.coverage += 1;
                if (steps.closesIn === 'coverage') board.listed = false;
                return Promise.resolve(steps.coverage ?? PASSING);
            },
        }),
        log: (line) => { logs.push(line); },
    };
    return { world, calls, logs, board, compaction: new Compaction(deps) };
}

const stages = (world: Fleet): readonly (readonly [string, string | null])[] => world.store.compactions.shownFor('w1:t1').map((record) => [record.stage, record.why]);
const closedLines = (logs: readonly string[]): readonly string[] => logs.filter((line) => line.includes('closed, skipped'));

test('the lane closes while the writer runs: no coverage check, no rewrite, nothing typed, skipped lane closed, no toast about a failure, one log line', async () => {
    const run = hostile({ closesIn: 'writer', coverage: MISSING });
    await run.compaction.run(AUTO);
    assert.deepEqual(run.calls, { writer: 1, coverage: 0, rewrites: 0 });
    assert.deepEqual(run.world.typed, []);
    assert.deepEqual(stages(run.world), [['skipped', 'lane closed']]);
    assert.ok(run.world.toasts.every((toast) => !/Could not compact|not compacted/u.test(toast)), run.world.toasts.join('\n'));
    assert.equal(closedLines(run.logs).length, 1);
    assert.match(closedLines(run.logs)[0] ?? '', /after the brief was written/u);
});

test('the lane closes during the first coverage check: no rewrite is asked for, and the end is the rewrite point', async () => {
    const run = hostile({ closesIn: 'coverage', coverage: MISSING });
    await run.compaction.run(AUTO);
    assert.deepEqual(run.calls, { writer: 1, coverage: 1, rewrites: 0 });
    assert.deepEqual(run.world.typed, []);
    assert.deepEqual(stages(run.world), [['skipped', 'lane closed']]);
    assert.match(closedLines(run.logs)[0] ?? '', /before a rewrite/u);
});

test('the lane closed while the decider answered: it is not on the board when the compaction begins, so no writer runs', async () => {
    const run = hostile();
    run.board.listed = false;
    await run.compaction.run(AUTO);
    assert.deepEqual(run.calls, { writer: 0, coverage: 0, rewrites: 0 });
    assert.deepEqual(run.world.typed, []);
    assert.deepEqual(stages(run.world), [['skipped', 'lane closed']]);
    assert.match(closedLines(run.logs)[0] ?? '', /before the brief/u);
    assert.deepEqual(run.world.toasts, []);
});

test('herdr answers agent_not_found at the status check before typing while the board still lists the pane: skipped lane closed, nothing typed', async () => {
    const run = hostile({ statuses: [IDLE, unknown({ why: 'not-found', what: 'agent w1:p1' })] });
    await run.compaction.run(AUTO);
    assert.equal(run.calls.writer, 1);
    assert.deepEqual(run.world.typed, []);
    assert.deepEqual(stages(run.world), [['skipped', 'lane closed']]);
    assert.ok(run.world.toasts.every((toast) => !/Could not compact/u.test(toast)), run.world.toasts.join('\n'));
    assert.match(closedLines(run.logs)[0] ?? '', /before typing/u);
});

test('herdr answers agent_not_found at the very first status check: skipped lane closed, no writer, no toast at all', async () => {
    const run = hostile({ statuses: [unknown({ why: 'not-found', what: 'agent w1:p1' })] });
    await run.compaction.run(AUTO);
    assert.deepEqual(run.calls, { writer: 0, coverage: 0, rewrites: 0 });
    assert.deepEqual(stages(run.world), [['skipped', 'lane closed']]);
    assert.deepEqual(run.world.toasts, []);
    assert.match(closedLines(run.logs)[0] ?? '', /at the status check/u);
});

test('herdr does not answer: the compaction fails as before, with its reason and the failure toast', async () => {
    const run = hostile({ statuses: [unknown({ why: 'unreachable', detail: 'socket closed' })] });
    await run.compaction.run(AUTO);
    assert.deepEqual(stages(run.world), [['failed', 'unreachable: socket closed']]);
    assert.match(run.world.toasts.join('\n'), /Could not compact claude: unreachable: socket closed/u);
    assert.deepEqual(closedLines(run.logs), []);
});

test('a token asked for a lane that closes while the brief is written is answered with the existing skipped reason', async () => {
    const run = hostile({ closesIn: 'writer' });
    await run.compaction.run({ ...AUTO, origin: 'request', answer: 'r9' });
    assert.deepEqual(run.world.answered.findLast((each) => each.startsWith('r9')), 'r9 w1:p1 failed-skipped');
    assert.deepEqual(run.world.typed, []);
});

test('an operator compaction of a lane that closes while the writer runs is skipped lane closed too, and nothing is typed', async () => {
    const run = hostile({ closesIn: 'writer' });
    await run.compaction.run({ tab: 'w1:t1', pane: 'w1:p1', note: null });
    assert.deepEqual(run.world.typed, []);
    assert.deepEqual(stages(run.world), [['skipped', 'lane closed']]);
});

test('an automatic request for a pane that left the board before any record exists is answered skipped, with one log line and no toast', async () => {
    const gone = typingFleet({});
    const logs: string[] = [];
    await new Compaction({ ...compactionDeps(gone, 'focused', 'w1:p1', [[compacted]], []), listsPane: (): boolean => false, log: (line: string): void => { logs.push(line); } }).run(AUTO);
    assert.deepEqual(gone.answered, ['r1 w1:p1 failed-skipped']);
    assert.deepEqual(gone.toasts, []);
    assert.equal(closedLines(logs).length, 1);
});

test('a lane that stays on the board is compacted as before', async () => {
    const run = hostile();
    await run.compaction.run(AUTO);
    assert.equal(run.world.typed.length, 1);
    assert.deepEqual(stages(run.world).map(([stage]) => stage), ['compacted']);
    assert.deepEqual(closedLines(run.logs), []);
});

const failedEvents = (world: Fleet): readonly string[] => world.laneEvents.filter((event) => event.includes('compact-failed'));

test('a lane closed end publishes no compact-failed event, whichever step saw the lane gone', async () => {
    const mid = hostile({ closesIn: 'writer' });
    await mid.compaction.run(AUTO);
    assert.deepEqual(failedEvents(mid.world), []);
    const first = hostile({ statuses: [unknown({ why: 'not-found', what: 'agent w1:p1' })] });
    await first.compaction.run(AUTO);
    assert.deepEqual(failedEvents(first.world), []);
});

test('a failure that is not a closed lane still publishes compact-failed', async () => {
    const run = hostile({ statuses: [unknown({ why: 'unreachable', detail: 'socket closed' })] });
    await run.compaction.run(AUTO);
    assert.equal(failedEvents(run.world).length, 1);
});
