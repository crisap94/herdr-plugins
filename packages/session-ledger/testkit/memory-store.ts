import {
    unknown as unknownOf,
    type Fact,
    type FactId,
    type FactStore,
    type HistoryFact,
    type LastRun,
    type Operation,
    type Recap,
    type Records,
    type Refusal,
    type RunRef,
    type ScopeId,
    type SessionKey,
    type TaskId,
    type Unknown,
} from '@stateforge-labs/session-ledger';

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

export interface StoreUnderTest {
    readonly records: Records;
    readonly facts: FactStore;
    failReads?(which: ReadName, times: number): void;
}

export interface MemoryStore {
    readonly records: Records;
    readonly facts: FactStore;
    calls(): readonly StoreCall[];
    failReads(which: ReadName, times: number): void;
    seed(recap: Recap | null, facts: readonly Fact[]): void;
    markdown(): string;
}

type Read = <T>(which: ReadName, value: () => T) => T | Unknown;

const isFactId = (text: string): text is FactId => typeof text === 'string';

const factIdOf = (text: string): FactId => {
    if (isFactId(text)) {
        return text;
    }
    throw new Error('testkit: a fact id is a string');
};

export const factOf = (id: string, over: Partial<Omit<Fact, 'id'>> = {}): Fact => ({
    id: factIdOf(id),
    task: { tab: 'tab-1', key: 'a' },
    section: 'now',
    text: '',
    why: null,
    ref: null,
    agent: null,
    anchor: null,
    firstAt: 0,
    lastAt: 0,
    state: 'open',
    closedWhy: null,
    closedAt: null,
    language: 'en',
    ...over,
});

const sameTask = (left: TaskId, right: TaskId): boolean => left.tab === right.tab && left.key === right.key;

const historyOf = (fact: Fact): HistoryFact => ({
    section: fact.section,
    text: fact.text,
    why: fact.why,
    state: fact.state,
    closedWhy: fact.closedWhy,
    closedAt: fact.closedAt,
    firstAt: fact.firstAt,
    lastAt: fact.lastAt,
});

const readerOf =
    (log: StoreCall[], failures: Map<ReadName, number>): Read =>
    (which, value) => {
        log.push(which);
        const left = failures.get(which) ?? 0;
        if (left > 0) {
            failures.set(which, left - 1);
            return unknownOf({ why: 'failed', code: 1, detail: `scripted ${which} failure` });
        }
        return value();
    };

interface Ledger {
    current(): readonly Fact[];
    replace(next: readonly Fact[]): void;
}

const factStoreOf = (log: StoreCall[], read: Read, ledger: Ledger, fold: Fold | undefined): FactStore => {
    const current = (): readonly Fact[] => ledger.current();
    return {
        openOf: (task: TaskId) => read('openOf', () => current().filter((fact) => fact.state === 'open' && sameTask(fact.task, task))),
        recentlyClosed: (task: TaskId, sinceMs: number) =>
            read('recentlyClosed', () =>
                current().filter((fact) => fact.state === 'closed' && sameTask(fact.task, task) && fact.closedAt !== null && fact.closedAt >= sinceMs),
            ),
        allOf: (task: TaskId) => read('allOf', () => current().filter((fact) => sameTask(fact.task, task))),
        keysOf: (scope: ScopeId) =>
            read('keysOf', () => [...new Set(current().filter((fact) => fact.task.tab === scope).map((fact) => fact.task.key))]),
        historyOf: (scope: ScopeId, key: SessionKey) => {
            log.push('historyOf');
            return current()
                .filter((fact) => fact.task.tab === scope && fact.task.key === key)
                .map(historyOf);
        },
        apply: (run: RunRef, ops: readonly Operation[]) => {
            log.push('apply');
            if (fold === undefined) {
                return { changed: [], refused: [] };
            }
            const folded = fold(current(), ops, run, false);
            ledger.replace(folded.ledger);
            return { changed: folded.changed, refused: folded.refused };
        },
    };
};

export function createMemoryStore(parts: StoreParts = {}): MemoryStore {
    const log: StoreCall[] = [];
    const failures = new Map<ReadName, number>();
    const read = readerOf(log, failures);
    let recap: Recap | null = parts.recap ?? null;
    const lastRun: LastRun | null = parts.lastRun ?? null;
    let stored: readonly Fact[] = parts.facts ?? [];

    const records: Records = {
        readRecap: (scope: ScopeId) => read('readRecap', () => (recap !== null && recap.tab === scope ? recap : null)),
        lastRunOf: () => read('lastRunOf', () => lastRun),
        beginRun: () => {
            log.push('beginRun');
        },
        recordRun: () => {
            log.push('recordRun');
        },
        failRun: () => {
            log.push('failRun');
        },
        advance: () => {
            log.push('advance');
        },
    };

    return {
        records,
        facts: factStoreOf(
            log,
            read,
            {
                current: () => stored,
                replace: (next: readonly Fact[]) => {
                    stored = next;
                },
            },
            parts.fold,
        ),
        calls: () => [...log],
        failReads: (which: ReadName, times: number) => {
            failures.set(which, times);
        },
        seed: (next: Recap | null, nextFacts: readonly Fact[]) => {
            recap = next;
            stored = nextFacts;
        },
        markdown: () =>
            stored
                .filter((fact) => fact.state === 'open')
                .map((fact) => fact.text)
                .join('\n'),
    };
}
