import type { AddOp, Advance, FailedRun, LastRun, Recap, RecordedRun, SessionCursor, TaskShape, Unknown } from '@stateforge-labs/session-ledger';
import { scope } from '../ids.ts';
import type { StoreUnderTest } from '../memory-store.ts';

export const isUnknownValue = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'unknown';

export const cursor = (pane: string, transcript = `/transcripts/${pane}.jsonl`): SessionCursor => ({
    pane,
    agent: 'claude',
    transcript,
    cursor: 1,
    tail: null,
    title: null,
    lastPrompt: null,
    claudeRecap: null,
});

export const shapeOf = (id: string, lanes: readonly string[]): TaskShape => ({ id, name: `Task ${id}`, lanes });

export const runOf = (over: Partial<RecordedRun> = {}): RecordedRun => ({
    tab: 'tab-1',
    at: 100,
    cause: 'requested',
    backend: 'claude',
    language: 'en',
    costUsd: 0.5,
    error: null,
    lanes: [cursor('p1')],
    tasks: [shapeOf('a', ['p1'])],
    ops: [],
    ...over,
});

export const failedOf = (over: Partial<FailedRun> = {}): FailedRun => ({
    tab: 'tab-1',
    at: 200,
    cause: 'requested',
    backend: 'codex',
    language: 'fr',
    costUsd: 0.1,
    error: 'the backend refused',
    lanes: [cursor('p2')],
    ...over,
});

export const advanceOf = (over: Partial<Advance> = {}): Advance => ({
    tab: 'tab-1',
    at: 300,
    error: 'stale',
    lanes: [cursor('p3')],
    ...over,
});

export const recapOf = (store: StoreUnderTest, tab: string): Recap => {
    const read = store.records.readRecap(scope(tab));
    if (read === null || isUnknownValue(read)) {
        throw new Error(`no recap for ${tab}`);
    }
    return read;
};

export const lastOf = (store: StoreUnderTest, tab: string): LastRun | null => {
    const read = store.records.lastRunOf(scope(tab));
    if (isUnknownValue(read)) {
        throw new Error(`the last run of ${tab} is Unknown`);
    }
    return read;
};

export const addOf = (text: string): AddOp => ({ op: 'add', section: 'now', text, why: null, ref: null, at: null, agent: null });

export const brokenAdd = (): AddOp => ({
    op: 'add',
    section: 'now',
    get text(): string {
        throw new Error('a broken op');
    },
    why: null,
    ref: null,
    at: null,
    agent: null,
});

export const shapesOf = (recap: Recap): readonly TaskShape[] => recap.tasks.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes }));
