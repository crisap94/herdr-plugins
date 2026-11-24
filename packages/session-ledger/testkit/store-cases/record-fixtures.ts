import type { Advance, Fact, FailedRun, LastRun, Recap, RecordedRun, SessionCursor, TaskShape, Unknown } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { scope } from '../ids.ts';
import { factOf } from '../facts.ts';
import type { StoreUnderTest } from '../memory-store.ts';
import { agentKind, cursorAt, paneId, sourcePath, tabId, text, usd } from '../values.ts';
import { textOf } from '../../src/recap/domain/text.ts';
import { tabIdOf, type SessionKey, paneIdOf } from '../../src/recap/domain/lane-shape.ts';

export const isUnknownValue = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'unknown';

export const cursor = (pane: string, transcript = `/transcripts/${pane}.jsonl`): SessionCursor => ({
    key: paneId(pane),
    agent: agentKind('claude'),
    transcript: sourcePath(transcript),
    cursor: cursorAt(1),
    tail: null,
    title: null,
    lastPrompt: null,
    harnessRecap: null,
});

export const shapeOf = (id: string, lanes: readonly SessionKey[]): TaskShape => ({ id: textOf(id), name: textOf(`Task ${id}`), sessions: lanes });

export const runOf = (over: Partial<RecordedRun> = {}): RecordedRun => ({
    scope: tabId('tab-1'),
    at: instant(100),
    cause: 'requested',
    backend: text('claude'),
    language: text('en'),
    costUsd: usd(0.5),
    error: null,
    sessions: [cursor('p1')],
    tasks: [shapeOf('a', [paneIdOf('p1')])],
    changed: [],
    refused: [],
    ...over,
});

export const failedOf = (over: Partial<FailedRun> = {}): FailedRun => ({
    scope: tabId('tab-1'),
    at: instant(200),
    cause: 'requested',
    backend: text('codex'),
    language: text('fr'),
    costUsd: usd(0.1),
    error: text('the backend refused'),
    sessions: [cursor('p2')],
    ...over,
});

export const advanceOf = (over: Partial<Advance> = {}): Advance => ({
    scope: tabId('tab-1'),
    at: instant(300),
    error: text('stale'),
    sessions: [cursor('p3')],
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

export const typeIdAt = (n: number): string => `fct_${String(n).padStart(26, '0')}`;

export const factAt = (id: string, over: Partial<Omit<Fact, 'id'>> = {}): Fact => factOf(id, over);

export const brokenFact = (): Fact => ({
    get id(): Fact['id'] {
        throw new Error('a broken fact');
    },
    task: { scope: tabIdOf('tab-1'), key: textOf('b') },
    section: 'now',
    text: textOf(''),
    why: null,
    ref: null,
    agent: null,
    anchor: null,
    firstAt: instant(0),
    lastAt: instant(0),
    state: 'open',
    closedWhy: null,
    closedAt: null,
    language: textOf('en'),
});

export const shapesOf = (recap: Recap): readonly TaskShape[] => recap.tasks.map((task) => ({ id: task.id, name: task.name, sessions: task.sessions }));
