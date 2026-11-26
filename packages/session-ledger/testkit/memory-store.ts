import {
    unknown as unknownOf,
    type Fact,
    type FactStore,
    type Instant,
    type LastRun,
    type Recap,
    type RecapTask,
    type Records,
    type RecordedRun,
    type Refusal,
    type ScopeId,
    type SessionKey,
    type SessionMark,
    type TaskId,
    type Text,
    type Unknown,
} from '@stateforge-labs/session-ledger';
import { emptyRecap, historyOf, sameTask } from './facts.ts';
import { failure, running, tabId } from './values.ts';
import { tabIdOf } from '../src/recap/domain/followed-session-shape.ts';
import { textOf } from '../src/recap/domain/text.ts';

export { factOf } from './facts.ts';

const HISTORY_LIMIT = 300;

export type ReadName = 'readRecap' | 'lastRunOf' | 'openOf' | 'recentlyClosed' | 'allOf' | 'keysOf';

export type StoreCall = ReadName | 'beginRun' | 'recordRun' | 'failRun' | 'advance' | 'historyOf';

export interface StoreParts {
    readonly recap?: Recap | null;
    readonly lastRun?: LastRun | null;
    readonly facts?: readonly Fact[];
}

export type StoredMark = Pick<SessionMark, 'at'>;

export interface StoreUnderTest {
    readonly records: Records;
    readonly facts: FactStore;
    marksOf(scope: ScopeId): readonly StoredMark[];
    failReads?(which: ReadName, times: number): void;
}

export interface MemoryStore {
    readonly records: Records;
    readonly facts: FactStore;
    marksOf(scope: ScopeId): readonly StoredMark[];
    calls(): readonly StoreCall[];
    failReads(which: ReadName, times: number): void;
    failRecords(times: number): void;
    seed(recap: Recap | null, facts: readonly Fact[]): void;
    markdown(): string;
    recorded(): readonly RecordedRun[];
    refusals(): readonly Refusal[];
}

interface State {
    readonly log: StoreCall[];
    readonly failures: Map<ReadName, number>;
    recordFailures: number;
    readonly recaps: Map<string, Recap>;
    readonly lastRuns: Map<string, LastRun>;
    readonly marks: Map<string, readonly StoredMark[]>;
    stored: readonly Fact[];
    readonly recordedRuns: RecordedRun[];
    readonly refused: Refusal[];
}

const read = <T>(state: State, which: ReadName, value: () => T): T | Unknown => {
    state.log.push(which);
    const left = state.failures.get(which) ?? 0;
    if (left > 0) {
        state.failures.set(which, left - 1);
        return unknownOf(failure(1, `scripted ${which} failure`));
    }
    return value();
};

const keptOf = (stored: readonly Fact[], changed: readonly Fact[]): readonly Fact[] => {
    const next = new Map(changed.map((fact) => [fact.id, fact]));
    const known = new Set(stored.map((fact) => fact.id));
    return [...stored.map((fact) => next.get(fact.id) ?? fact), ...changed.filter((fact) => !known.has(fact.id))];
};

const ensure = (state: State, scope: string, at: Instant | null): Recap => {
    const current = state.recaps.get(scope) ?? { ...emptyRecap(tabId(scope)), at };
    state.recaps.set(scope, current);
    return current;
};

const tasksOf = (facts: readonly Fact[], run: RecordedRun): readonly RecapTask[] =>
    run.tasks.map((task) => ({
        id: task.id,
        name: task.name,
        sessions: task.sessions,
        sections: null,
        markdown: textOf(facts
            .filter((fact) => fact.state === 'open' && sameTask(fact.task, { scope: run.scope, key: task.id }))
            .map((fact) => fact.text)
            .join('\n')),
    }));

const keepMarks = (state: State, scope: string, marks: readonly SessionMark[] | undefined): void => {
    state.marks.set(scope, [...(state.marks.get(scope) ?? []), ...(marks ?? []).map((mark) => ({ at: mark.at }))]);
};

const recordsOf = (state: State): Records => ({
    readRecap: (scope: ScopeId) => read(state, 'readRecap', () => state.recaps.get(scope) ?? null),
    lastRunOf: (scope: ScopeId) => read(state, 'lastRunOf', () => state.lastRuns.get(scope) ?? null),
    beginRun: (scope: ScopeId, backend: Text | null, at: Instant) => {
        state.log.push('beginRun');
        state.recaps.set(scope, { ...ensure(state, scope, at), running: running(true), backend });
    },
    recordRun: (run: RecordedRun) => {
        state.log.push('recordRun');
        state.recordedRuns.push(run);
        if (state.recordFailures > 0) { state.recordFailures -= 1; throw new Error('scripted recordRun failure'); }
        state.stored = keptOf(state.stored, run.changed);
        state.refused.push(...run.refused);
        state.recaps.set(run.scope, {
            scope: run.scope,
            sessions: run.sessions,
            tasks: tasksOf(state.stored, run),
            at: run.at,
            running: running(false),
            backend: run.backend,
            error: run.error,
            costUsd: run.costUsd,
            language: run.language,
        });
        state.lastRuns.set(run.scope, { at: run.at, cause: run.cause });
        keepMarks(state, run.scope, run.marks);
    },
    failRun: (run) => {
        state.log.push('failRun');
        state.recaps.set(run.scope, { ...ensure(state, run.scope, run.at), sessions: run.sessions, running: running(false), backend: run.backend, error: run.error });
        keepMarks(state, run.scope, run.marks);
    },
    advance: (move) => {
        state.log.push('advance');
        state.recaps.set(move.scope, { ...ensure(state, move.scope, move.at), sessions: move.sessions, error: move.error });
        keepMarks(state, move.scope, move.marks);
    },
});

const factsOf = (state: State): FactStore => ({
    openOf: (task: TaskId) =>
        read(state, 'openOf', () =>
            state.stored.filter((fact) => fact.state === 'open' && sameTask(fact.task, task)).toSorted((a, b) => b.lastAt - a.lastAt),
        ),
    recentlyClosed: (task: TaskId, sinceMs: number) =>
        read(state, 'recentlyClosed', () =>
            state.stored
                .filter((fact) => fact.state === 'closed' && sameTask(fact.task, task) && fact.closedAt !== null && fact.closedAt >= sinceMs)
                .toSorted((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0)),
        ),
    allOf: (task: TaskId) => read(state, 'allOf', () => state.stored.filter((fact) => sameTask(fact.task, task)).toSorted((a, b) => a.firstAt - b.firstAt)),
    keysOf: (scope: ScopeId) =>
        read(state, 'keysOf', () =>
            [...new Set(state.stored.filter((fact) => fact.task.scope === tabIdOf(scope)).map((fact) => fact.task.key))].toSorted(),
        ),
    historyOf: (scope: ScopeId, key: SessionKey) => {
        state.log.push('historyOf');
        return state.stored
            .filter((fact) => fact.task.scope === tabIdOf(scope) && fact.task.key === textOf(key))
            .toSorted((a, b) => b.lastAt - a.lastAt)
            .slice(0, HISTORY_LIMIT)
            .map(historyOf);
    },
});

const seedOf = (state: State, parts: StoreParts): void => {
    if (parts.recap !== undefined && parts.recap !== null) {
        state.recaps.set(parts.recap.scope, parts.recap);
        if (parts.lastRun !== undefined && parts.lastRun !== null) {
            state.lastRuns.set(parts.recap.scope, parts.lastRun);
        }
    }
};

export function createMemoryStore(parts: StoreParts = {}): MemoryStore {
    const state: State = {
        log: [],
        failures: new Map(),
        recordFailures: 0,
        recaps: new Map(),
        lastRuns: new Map(),
        marks: new Map(),
        stored: parts.facts ?? [],
        recordedRuns: [],
        refused: [],
    };
    seedOf(state, parts);
    return {
        records: recordsOf(state),
        facts: factsOf(state),
        marksOf: (scope: ScopeId) => [...(state.marks.get(scope) ?? [])],
        calls: () => [...state.log],
        failReads: (which: ReadName, times: number) => {
            state.failures.set(which, times);
        },
        failRecords: (times: number) => { state.recordFailures = times; },
        seed: (next: Recap | null, nextFacts: readonly Fact[]) => {
            if (next !== null) {
                state.recaps.set(next.scope, next);
            }
            state.stored = nextFacts;
        },
        recorded: () => [...state.recordedRuns],
        refusals: () => [...state.refused],
        markdown: () =>
            state.stored
                .filter((fact) => fact.state === 'open')
                .map((fact) => fact.text)
                .join('\n'),
    };
}
