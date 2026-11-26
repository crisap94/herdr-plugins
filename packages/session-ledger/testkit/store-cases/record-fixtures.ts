import type { Advance, Fact, FailedRun, LastRun, Recap, RecordedRun, SessionCursor, TaskShape, Unknown } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { factOf } from '../facts.ts';
import type { StoreUnderTest } from '../memory-store.ts';
import { agentKind, cursorAt, sourcePath, text, usd } from '../values.ts';
import { textOf } from '../../src/recap/domain/text.ts';
import { scopeIdOf, type SessionKey, sessionKeyOf } from '../../src/recap/domain/followed-session-shape.ts';

export const isUnknownValue = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'unknown';

export const cursor = (key: string, transcript = `/transcripts/${key}.jsonl`): SessionCursor => ({
    key: sessionKeyOf(key),
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
    scope: scopeIdOf('tab-1'),
    at: instant(100),
    cause: 'requested',
    backend: text('claude'),
    language: text('en'),
    costUsd: usd(0.5),
    error: null,
    sessions: [cursor('p1')],
    tasks: [shapeOf('a', [sessionKeyOf('p1')])],
    changed: [],
    refused: [],
    ...over,
});

export const failedOf = (over: Partial<FailedRun> = {}): FailedRun => ({
    scope: scopeIdOf('tab-1'),
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
    scope: scopeIdOf('tab-1'),
    at: instant(300),
    error: text('stale'),
    sessions: [cursor('p3')],
    ...over,
});

export const recapOf = (store: StoreUnderTest, scope: string): Recap => {
    const read = store.records.readRecap(scopeIdOf(scope));
    if (read === null || isUnknownValue(read)) {
        throw new Error(`no recap for ${scope}`);
    }
    return read;
};

export const lastOf = (store: StoreUnderTest, scope: string): LastRun | null => {
    const read = store.records.lastRunOf(scopeIdOf(scope));
    if (isUnknownValue(read)) {
        throw new Error(`the last run of ${scope} is Unknown`);
    }
    return read;
};

export const typeIdAt = (n: number): string => `fct_${String(n).padStart(26, '0')}`;

export const factAt = (id: string, over: Partial<Omit<Fact, 'id'>> = {}): Fact => factOf(id, over);

export const brokenFact = (): Fact => ({
    get id(): Fact['id'] {
        throw new Error('a broken fact');
    },
    task: { scope: scopeIdOf('tab-1'), key: textOf('b') },
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
