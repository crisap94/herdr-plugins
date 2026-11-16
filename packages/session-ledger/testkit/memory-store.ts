import {
    unknown as unknownOf,
    type Fact,
    type FactId,
    type FactStore,
    type HistoryFact,
    type LastRun,
    type Operation,
    type Recap,
    type RecapTask,
    type Records,
    type RecordedRun,
    type Refusal,
    type RunRef,
    type ScopeId,
    type SessionKey,
    type SessionMark,
    type TaskId,
    type Unknown,
} from '@stateforge-labs/session-ledger';
import { factIdOf, runIdOf } from './facts.ts';

export { factOf } from './facts.ts';

export type ReadName = 'readRecap' | 'lastRunOf' | 'openOf' | 'recentlyClosed' | 'allOf' | 'keysOf';

export type StoreCall = ReadName | 'beginRun' | 'recordRun' | 'failRun' | 'advance' | 'historyOf' | 'apply';

export interface Folded {
    readonly ledger: readonly Fact[];
    readonly refused: readonly Refusal[];
    readonly changed: readonly Fact[];
}

export type Fold = (before: readonly Fact[], ops: readonly Operation[], run: RunRef, sweepNow: boolean) => Folded;

export interface StoreParts {
    readonly recap?: Recap | null;
    readonly lastRun?: LastRun | null;
    readonly facts?: readonly Fact[];
    readonly fold?: Fold;
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
    seed(recap: Recap | null, facts: readonly Fact[]): void;
    markdown(): string;
}

interface State {
    readonly log: StoreCall[];
    readonly failures: Map<ReadName, number>;
    readonly recaps: Map<string, Recap>;
    readonly lastRuns: Map<string, LastRun>;
    readonly marks: Map<string, readonly StoredMark[]>;
    readonly fold: Fold | undefined;
    stored: readonly Fact[];
    minted: number;
    runs: number;
}

const sameTask = (left: TaskId, right: TaskId): boolean => left.tab === right.tab && left.key === right.key;

const historyOf = ({ section, text, why, state, closedWhy, closedAt, firstAt, lastAt }: Fact): HistoryFact => ({
    section,
    text,
    why,
    state,
    closedWhy,
    closedAt,
    firstAt,
    lastAt,
});

const read = <T>(state: State, which: ReadName, value: () => T): T | Unknown => {
    state.log.push(which);
    const left = state.failures.get(which) ?? 0;
    if (left > 0) {
        state.failures.set(which, left - 1);
        return unknownOf({ why: 'failed', code: 1, detail: `scripted ${which} failure` });
    }
    return value();
};

const emptyRecap = (tab: string): Recap => ({
    tab, lanes: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: '',
});

const applyTo = (fold: Fold | undefined, before: readonly Fact[], run: RunRef, ops: readonly Operation[]): { readonly next: readonly Fact[]; readonly changed: readonly Fact[]; readonly refused: readonly Refusal[] } => {
    if (fold === undefined) {
        return { next: before, changed: [], refused: [] };
    }
    const own = before.filter((fact) => sameTask(fact.task, run.task));
    const folded = fold(own, ops, run, false);
    return {
        next: [...before.filter((fact) => !sameTask(fact.task, run.task)), ...folded.ledger],
        changed: folded.changed,
        refused: folded.refused,
    };
};

const mintOf =
    (state: State): (() => FactId) =>
    () => {
        state.minted += 1;
        return factIdOf(`fct_${state.minted}`);
    };

const refOf = (state: State, task: TaskId, at: number, language: string): RunRef => {
    state.runs += 1;
    return { id: runIdOf(`run_${state.runs}`), task, at, language, mint: mintOf(state) };
};

const ensure = (state: State, scope: string, at: number | null): Recap => {
    const current = state.recaps.get(scope) ?? { ...emptyRecap(scope), at };
    state.recaps.set(scope, current);
    return current;
};

const foldOps = (state: State, run: RecordedRun): { readonly facts: readonly Fact[]; readonly tasks: readonly RecapTask[] } => {
    let facts = state.stored;
    for (const taskOps of run.ops) {
        facts = applyTo(state.fold, facts, refOf(state, { tab: run.tab, key: taskOps.task }, run.at, run.language), taskOps.ops).next;
    }
    const tasks = run.tasks.map((task) => ({
        id: task.id,
        name: task.name,
        lanes: task.lanes,
        sections: null,
        markdown: facts
            .filter((fact) => fact.state === 'open' && sameTask(fact.task, { tab: run.tab, key: task.id }))
            .map((fact) => fact.text)
            .join('\n'),
    }));
    return { facts, tasks };
};

const keepMarks = (state: State, scope: string, marks: readonly SessionMark[] | undefined): void => {
    state.marks.set(scope, [...(state.marks.get(scope) ?? []), ...(marks ?? []).map((mark) => ({ at: mark.at }))]);
};

const recordsOf = (state: State): Records => ({
    readRecap: (scope: ScopeId) => read(state, 'readRecap', () => state.recaps.get(scope) ?? null),
    lastRunOf: (scope: ScopeId) => read(state, 'lastRunOf', () => state.lastRuns.get(scope) ?? null),
    beginRun: (scope: ScopeId, backend: string | null, at: number) => {
        state.log.push('beginRun');
        state.recaps.set(scope, { ...ensure(state, scope, at), running: true, backend });
    },
    recordRun: (run: RecordedRun) => {
        state.log.push('recordRun');
        const folded = foldOps(state, run);
        state.stored = folded.facts;
        state.recaps.set(run.tab, {
            tab: run.tab,
            lanes: run.lanes,
            tasks: folded.tasks,
            at: run.at,
            running: false,
            backend: run.backend,
            error: run.error,
            costUsd: run.costUsd,
            language: run.language,
        });
        state.lastRuns.set(run.tab, { at: run.at, cause: run.cause });
        keepMarks(state, run.tab, run.marks);
    },
    failRun: (run) => {
        state.log.push('failRun');
        state.recaps.set(run.tab, { ...ensure(state, run.tab, run.at), lanes: run.lanes, running: false, backend: run.backend, error: run.error });
        keepMarks(state, run.tab, run.marks);
    },
    advance: (move) => {
        state.log.push('advance');
        state.recaps.set(move.tab, { ...ensure(state, move.tab, move.at), lanes: move.lanes, error: move.error });
        keepMarks(state, move.tab, move.marks);
    },
});

const factsOf = (state: State): FactStore => ({
    openOf: (task: TaskId) => read(state, 'openOf', () => state.stored.filter((fact) => fact.state === 'open' && sameTask(fact.task, task))),
    recentlyClosed: (task: TaskId, sinceMs: number) =>
        read(state, 'recentlyClosed', () =>
            state.stored.filter((fact) => fact.state === 'closed' && sameTask(fact.task, task) && fact.closedAt !== null && fact.closedAt >= sinceMs),
        ),
    allOf: (task: TaskId) => read(state, 'allOf', () => state.stored.filter((fact) => sameTask(fact.task, task))),
    keysOf: (scope: ScopeId) =>
        read(state, 'keysOf', () => [...new Set(state.stored.filter((fact) => fact.task.tab === scope).map((fact) => fact.task.key))]),
    historyOf: (scope: ScopeId, key: SessionKey) => {
        state.log.push('historyOf');
        return state.stored.filter((fact) => fact.task.tab === scope && fact.task.key === key).map(historyOf);
    },
    apply: (run: RunRef, ops: readonly Operation[]) => {
        state.log.push('apply');
        const applied = applyTo(state.fold, state.stored, run, ops);
        state.stored = applied.next;
        return { changed: applied.changed, refused: applied.refused };
    },
});

const seedOf = (state: State, parts: StoreParts): void => {
    if (parts.recap !== undefined && parts.recap !== null) {
        state.recaps.set(parts.recap.tab, parts.recap);
        if (parts.lastRun !== undefined && parts.lastRun !== null) {
            state.lastRuns.set(parts.recap.tab, parts.lastRun);
        }
    }
};

export function createMemoryStore(parts: StoreParts = {}): MemoryStore {
    const state: State = {
        log: [],
        failures: new Map(),
        recaps: new Map(),
        lastRuns: new Map(),
        marks: new Map(),
        fold: parts.fold,
        stored: parts.facts ?? [],
        minted: 0,
        runs: 0,
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
        seed: (next: Recap | null, nextFacts: readonly Fact[]) => {
            if (next !== null) {
                state.recaps.set(next.tab, next);
            }
            state.stored = nextFacts;
        },
        markdown: () =>
            state.stored
                .filter((fact) => fact.state === 'open')
                .map((fact) => fact.text)
                .join('\n'),
    };
}
