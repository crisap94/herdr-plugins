import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsAsOf, resolveClosedLane } from '#src/recap/application/closed-lane-source.ts';
import type { ClosedLaneResolution } from '#src/recap/application/closed-lane-source.ts';
import type { ClosedSourceDeps } from '#src/recap/application/closed-lane-source.ts';
import { resolveSource } from '#src/recap/application/handoff-source.ts';
import type { SourceResolution } from '#src/recap/application/handoff-source.ts';
import { CLOSED_SHOWN_MS } from '#src/recap/application/ledger-input.ts';
import type { ClosedLaneRead, ClosureReader } from '#src/ports/closed-lanes.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { closedLaneDaysOf } from '#src/recap/domain/retention.ts';
import { instant } from '#src/recap/domain/time.ts';
import { MemoryClosedLanes } from '#test/fakes/closed-lanes-memory.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';

const DAY = 86_400_000;
const NOW = instant(Date.parse('2026-10-11T10:00:00Z'));
const CLOSED = instant(NOW - DAY);
const TAB = tabId('w1:t1');
const PANE = paneId('w1:p1');
const AGENT = agentKind('claude');
const T1: TaskId = { tab: 'w1:t1', key: 't1' };
const IDENTITY: ClosedLaneIdentity = { tab: TAB, pane: PANE, closedAt: CLOSED };
const FOURTEEN = closedLaneDaysOf('14');
const DISABLED = closedLaneDaysOf('0');

const readOf = (read: ClosedLaneRead): Pick<ClosureReader, 'resolve'> => ({ resolve: () => read });

const rowOf = (closedAt: number, association: { readonly task: TaskId; readonly name: string | null } | null = { task: T1, name: 'alpha' }): ClosedLaneRead => ({
    kind: 'row',
    record: { tab: TAB, pane: PANE, agent: AGENT, closedAt: instant(closedAt), cwd: null, association },
});

function depsOf(read: ClosedLaneRead, parts: { readonly ledger?: Pick<Ledger, 'allOf'>; readonly closedDays?: ClosedSourceDeps['closedDays']; readonly now?: ClosedSourceDeps['now'] } = {}): ClosedSourceDeps {
    return {
        closures: readOf(read),
        ledger: parts.ledger ?? new MemoryLedger(),
        runs: { runAt: () => null },
        closedDays: parts.closedDays ?? FOURTEEN,
        now: parts.now ?? NOW,
    };
}

const withoutView = (resolution: ClosedLaneResolution | SourceResolution): object => (resolution.kind === 'found' ? { kind: resolution.kind, task: resolution.task, facts: resolution.facts } : resolution);

const F_OPEN = fact('f1', 'goal', 'open before the close', CLOSED - 5000, { task: T1 });
const F_LATER = fact('f2', 'now', 'closed after the close', CLOSED - 1000, { task: T1, state: 'closed', closedAt: CLOSED + 1000, closedWhy: 'done' });
const F_EDGE = fact('f3', 'done', 'closed exactly two hours before the close', CLOSED - 9000, { task: T1, state: 'closed', closedAt: CLOSED - CLOSED_SHOWN_MS, closedWhy: 'done' });
const F_STALE = fact('f4', 'done', 'closed one millisecond beyond two hours', CLOSED - 9000, { task: T1, state: 'closed', closedAt: CLOSED - CLOSED_SHOWN_MS - 1, closedWhy: 'done' });
const F_FUTURE = fact('f5', 'goal', 'first seen after the close', CLOSED + 1000, { task: T1 });
const LEDGER_FACTS: readonly Fact[] = [F_OPEN, F_LATER, F_EDGE, F_STALE, F_FUTURE];

test('a closure in the window resolves to its task with the facts as of the close', () => {
    const ledger = new MemoryLedger().seed(...LEDGER_FACTS);
    assert.deepEqual(withoutView(resolveClosedLane(IDENTITY, depsOf(rowOf(CLOSED), { ledger }))), { kind: 'found', task: T1, facts: [F_OPEN, F_LATER, F_EDGE] });
});

test('the two-hour recently-closed window is inclusive at its start and drops one millisecond beyond', () => {
    assert.deepEqual(factsAsOf([F_EDGE, F_STALE], CLOSED), [F_EDGE]);
});

test('a fact first seen after the close is not part of the close', () => {
    assert.deepEqual(factsAsOf([F_FUTURE], CLOSED), []);
});

test('an absent row is never-seen', () => {
    assert.deepEqual(resolveClosedLane(IDENTITY, depsOf({ kind: 'absent' })), { kind: 'never-seen' });
});

test('a row without an association is never-seen', () => {
    assert.deepEqual(resolveClosedLane(IDENTITY, depsOf(rowOf(CLOSED, null))), { kind: 'never-seen' });
});

test('a row older than the window is expired', () => {
    const old = NOW - 14 * DAY - 1;
    assert.deepEqual(resolveClosedLane(IDENTITY, depsOf(rowOf(old))), { kind: 'expired', closedAt: instant(old) });
});

test('a row exactly at the window start is still inside it', () => {
    const edge = NOW - 14 * DAY;
    assert.deepEqual(withoutView(resolveClosedLane(IDENTITY, depsOf(rowOf(edge), { ledger: new MemoryLedger() }))), { kind: 'found', task: T1, facts: [] });
});

test('days = 0 answers never-seen even for a stored row', () => {
    assert.deepEqual(resolveClosedLane(IDENTITY, depsOf(rowOf(CLOSED), { closedDays: DISABLED })), { kind: 'never-seen' });
});

test('an unreadable store is unknown with reason store-unreadable', () => {
    assert.deepEqual(resolveClosedLane(IDENTITY, depsOf(unknown({ why: 'unreadable', detail: 'locked' }))), { kind: 'unknown', reason: 'store-unreadable' });
});

test('a throwing ledger is unknown with reason ledger-unreadable', () => {
    const throwing: Pick<Ledger, 'allOf'> = { allOf: () => { throw new Error('store locked'); } };
    assert.deepEqual(resolveClosedLane(IDENTITY, depsOf(rowOf(CLOSED), { ledger: throwing })), { kind: 'unknown', reason: 'ledger-unreadable' });
});

test('after a prune an expired closure becomes never-seen', () => {
    const store = new MemoryClosedLanes(FOURTEEN);
    store.record({ tab: TAB, pane: PANE, agent: AGENT, since: null, cwd: null, closedAt: CLOSED });
    const later = instant(CLOSED + 15 * DAY);
    const deps: ClosedSourceDeps = { closures: store, ledger: new MemoryLedger(), runs: { runAt: () => null }, closedDays: FOURTEEN, now: later };
    assert.deepEqual(resolveClosedLane(IDENTITY, deps), { kind: 'expired', closedAt: CLOSED });
    assert.equal(store.pruneTab(TAB, later), 1);
    assert.deepEqual(resolveClosedLane(IDENTITY, deps), { kind: 'never-seen' });
});

test('the closed registry entry answers found, source-unavailable or unknown', () => {
    const ledger = new MemoryLedger().seed(...LEDGER_FACTS);
    assert.deepEqual(withoutView(resolveSource('closed', IDENTITY, depsOf(rowOf(CLOSED), { ledger }))), { kind: 'found', task: T1, facts: [F_OPEN, F_LATER, F_EDGE] });
    assert.deepEqual(resolveSource('closed', IDENTITY, depsOf(rowOf(NOW - 14 * DAY - 1))), { kind: 'source-unavailable' });
    assert.deepEqual(resolveSource('closed', IDENTITY, depsOf({ kind: 'absent' })), { kind: 'source-unavailable' });
    assert.deepEqual(resolveSource('closed', IDENTITY, depsOf(unknown({ why: 'unreadable', detail: 'locked' }))), { kind: 'unknown', why: 'store-unreadable' });
});

test('a closure past the window is expired, and once the sweep has pruned it the same identity is never-seen', () => {
    let stored: ClosedLaneRead = rowOf(CLOSED);
    const closures: Pick<ClosureReader, 'resolve'> = { resolve: (): ClosedLaneRead => stored };
    const later = instant(CLOSED + 15 * DAY);
    const deps: ClosedSourceDeps = { closures, ledger: new MemoryLedger(), runs: { runAt: () => null }, closedDays: FOURTEEN, now: later };
    assert.deepEqual(resolveClosedLane(IDENTITY, deps), { kind: 'expired', closedAt: CLOSED });
    stored = { kind: 'absent' };
    assert.deepEqual(resolveClosedLane(IDENTITY, deps), { kind: 'never-seen' });
});
