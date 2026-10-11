import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSource } from '#src/recap/application/handoff-source.ts';
import type { SourceDeps } from '#src/recap/application/handoff-source.ts';
import { HANDOFF_CLOSED_WINDOW_MS } from '#src/recap/application/handoff-limits.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { RecapRecords, TabRecap } from '#src/ports/recap-records.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';

const NOW = Date.parse('2026-10-11T10:00:00Z');
const TAB = tabId('w1:t1');
const SOURCE = { tab: TAB, pane: paneId('w1:p1') };
const board = [
    laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', session: 'sess-1' }),
    laneFrom({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex', status: 'idle', cwd: '/repo' }),
];

const task = (key: string, lanes: readonly string[]): RecapTask => ({ id: key, name: key, lanes, sections: null, markdown: '' });

const recapWith = (...tasks: readonly RecapTask[]): TabRecap => ({ ...blankRecap('w1:t1'), tasks });

const readingOf = (recap: TabRecap | null): Pick<RecapRecords, 'readRecap'> => ({ readRecap: () => recap });

interface Parts {
    readonly lanes?: readonly Lane[];
    readonly recap?: TabRecap | null;
    readonly records?: Pick<RecapRecords, 'readRecap'>;
    readonly facts?: readonly Fact[];
}

function depsOf(parts: Parts = {}): SourceDeps {
    return {
        lanes: parts.lanes ?? board,
        records: parts.records ?? readingOf(parts.recap === undefined ? recapWith(task('t1', ['w1:p1'])) : parts.recap),
        ledger: new MemoryLedger().seed(...(parts.facts ?? [])),
        now: NOW,
    };
}

const T1: TaskId = { tab: 'w1:t1', key: 't1' };
const T2: TaskId = { tab: 'w1:t1', key: 't2' };

test('a tab with several tasks yields only the source task facts', () => {
    const mine = fact('f1', 'goal', 'mine', NOW - 1000, { task: T1 });
    const theirs = fact('f2', 'goal', 'theirs', NOW - 1000, { task: T2 });
    const resolved = resolveSource('live', SOURCE, depsOf({
        recap: recapWith(task('t1', ['w1:p1']), task('t2', ['w1:p2'])),
        facts: [mine, theirs],
    }));
    assert.deepEqual(resolved, { kind: 'found', source: 'live', task: T1, facts: [mine] });
});

test('a source lane listed by two tasks is task-ambiguous and renders no facts', () => {
    const resolved = resolveSource('live', SOURCE, depsOf({
        recap: recapWith(task('t1', ['w1:p1']), task('t2', ['w1:p1'])),
        facts: [fact('f1', 'goal', 'mine', NOW, { task: T1 })],
    }));
    assert.deepEqual(resolved, { kind: 'task-ambiguous' });
});

test('a pane the board does not hold is source-unavailable', () => {
    const resolved = resolveSource('live', { tab: TAB, pane: paneId('w1:p9') }, depsOf({ recap: recapWith(task('t1', ['w1:p9'])) }));
    assert.deepEqual(resolved, { kind: 'source-unavailable' });
});

test('a pane that is a lane of another tab is source-unavailable', () => {
    const otherTab = [laneFrom({ paneId: 'w1:p1', tabId: 'w1:t2', workspaceId: 'w1', agent: 'claude', status: 'idle', session: 'sess-1' })];
    const resolved = resolveSource('live', SOURCE, depsOf({ lanes: otherTab }));
    assert.deepEqual(resolved, { kind: 'source-unavailable' });
});

test('a lane that no task lists is unlisted and never falls back to the first task', () => {
    const resolved = resolveSource('live', SOURCE, depsOf({
        recap: recapWith(task('t1', ['w1:p2'])),
        facts: [fact('f1', 'goal', 'theirs', NOW, { task: T1 })],
    }));
    assert.deepEqual(resolved, { kind: 'unlisted' });
});

test('a lane with no recap yet is unlisted', () => {
    assert.deepEqual(resolveSource('live', SOURCE, depsOf({ recap: null })), { kind: 'unlisted' });
});

test('a task with no facts still resolves, so the flow decides ledger-empty after a refresh', () => {
    assert.deepEqual(resolveSource('live', SOURCE, depsOf({ facts: [] })), { kind: 'found', source: 'live', task: T1, facts: [] });
});

test('closed facts count only inside the closed window', () => {
    const recent = fact('f1', 'done', 'recent', NOW - 1000, { task: T1, state: 'closed', closedAt: NOW - HANDOFF_CLOSED_WINDOW_MS + 1000, closedWhy: 'done' });
    const stale = fact('f2', 'done', 'stale', NOW - 1000, { task: T1, state: 'closed', closedAt: NOW - HANDOFF_CLOSED_WINDOW_MS - 1000, closedWhy: 'done' });
    const resolved = resolveSource('live', SOURCE, depsOf({ facts: [recent, stale] }));
    assert.deepEqual(resolved, { kind: 'found', source: 'live', task: T1, facts: [recent] });
});

test('a source that cannot be read is unknown', () => {
    const broken: Pick<RecapRecords, 'readRecap'> = { readRecap: () => { throw new Error('store locked'); } };
    assert.deepEqual(resolveSource('live', SOURCE, depsOf({ records: broken })), { kind: 'unknown', why: 'Error' });
});
