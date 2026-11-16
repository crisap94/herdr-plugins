import {
    instant,
    unknown as unknownOf,
    UNREAD,
    type Chunk,
    type Clock,
    type EnginePlugs,
    type HarnessKind,
    type Ids,
    type Instant,
    type LedgerEvent,
    type RecapRequest,
    type RepoResult,
    type SessionReader,
    type SessionSource,
    type Unknown,
    type Unknowable,
    type Workplaces,
    type Writer,
} from '@stateforge-labs/session-ledger';
import { createMemoryStore, type MemoryStore } from './memory-store.ts';

export type Settled<T> =
    | { readonly kind: 'answer'; readonly value: T }
    | { readonly kind: 'fail'; readonly why: Unknowable }
    | { readonly kind: 'throw'; readonly message: string };

export type Behaviour<T> = Settled<T> | { readonly kind: 'block'; readonly after: Settled<T> };

export interface ManualClock extends Clock {
    set(ms: number): void;
}

export type WrittenAnswer = { readonly kind: 'written'; readonly text: string; readonly costUsd: number };

export type LocatedAnswer = { readonly kind: 'located'; readonly source: string };

export interface WorldOptions {
    readonly writer?: Behaviour<WrittenAnswer>;
    readonly locate?: Behaviour<LocatedAnswer>;
    readonly read?: Behaviour<Chunk>;
}

export interface EngineWorld {
    readonly plugs: EnginePlugs;
    readonly store: MemoryStore;
    readonly clock: ManualClock;
    requests(): readonly RecapRequest[];
    lines(): readonly string[];
    events(): readonly LedgerEvent[];
    release(): void;
}

type Run = <T>(behaviour: Behaviour<T>) => Promise<T | Unknown>;

interface Gate {
    readonly opened: Promise<void>;
    open(): void;
}

const gateOf = (): Gate => {
    let release: (() => void) | null = null;
    const opened = new Promise<void>((resolve) => {
        release = resolve;
    });
    return {
        opened,
        open: () => release?.(),
    };
};

const settle = <T>(settled: Settled<T>): Promise<T | Unknown> => {
    if (settled.kind === 'answer') {
        return Promise.resolve(settled.value);
    }
    if (settled.kind === 'fail') {
        return Promise.resolve(unknownOf(settled.why));
    }
    return Promise.reject(new Error(settled.message));
};

const runnerOf =
    (opened: Promise<void>): Run =>
    (behaviour) => {
        if (behaviour.kind === 'block') {
            return opened.then(() => settle(behaviour.after));
        }
        return settle(behaviour);
    };

const clockOf = (): ManualClock => {
    let nowMs = 0;
    return {
        now: (): Instant => instant(nowMs),
        set: (ms: number) => {
            nowMs = ms;
        },
    };
};

const idsOf = (): Ids => {
    let serial = 0;
    return {
        next: () => {
            serial += 1;
            return `id-${serial}`;
        },
    };
};

const sessionsOf = (run: Run, locate: Behaviour<LocatedAnswer>, read: Behaviour<Chunk>): SessionSource => {
    const readerFor = (harness: HarnessKind): SessionReader => ({
        harness,
        locate: () => run(locate),
        read: () => run(read),
    });
    return {
        readerFor,
        unavailableReason: (harness: HarnessKind) => `no scripted reader for ${harness}`,
    };
};

const writerOf = (run: Run, store: MemoryStore, requests: RecapRequest[], behaviour: Behaviour<WrittenAnswer> | undefined): Writer => ({
    backend: 'scripted',
    contract: 'free-text',
    write: (request: RecapRequest) => {
        requests.push(request);
        if (behaviour !== undefined) {
            return run(behaviour);
        }
        return run({ kind: 'answer', value: { kind: 'written', text: store.markdown(), costUsd: 0 } });
    },
});

const workplaces: Workplaces = {
    repoOf: () => Promise.resolve<RepoResult>({ kind: 'no-repo' }),
};

export function createEngineWorld(options: WorldOptions = {}): EngineWorld {
    const gate = gateOf();
    const run = runnerOf(gate.opened);
    const store = createMemoryStore();
    const clock = clockOf();
    const lines: string[] = [];
    const emitted: LedgerEvent[] = [];
    const requests: RecapRequest[] = [];
    const locate: Behaviour<LocatedAnswer> = options.locate ?? { kind: 'answer', value: { kind: 'located', source: 'scripted' } };
    const read: Behaviour<Chunk> = options.read ?? {
        kind: 'answer',
        value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: UNREAD, grew: false },
    };

    const plugs: EnginePlugs = {
        source: { sessions: sessionsOf(run, locate, read) },
        store: { records: store.records, facts: store.facts },
        models: { writer: () => writerOf(run, store, requests, options.writer) },
        environment: {
            clock,
            ids: idsOf(),
            workplaces,
            log: (line: string) => {
                lines.push(line);
            },
        },
        settings: {
            language: () => 'en',
            writerView: () => ({ kind: 'full' }),
        },
        on: (event: LedgerEvent) => {
            emitted.push(event);
        },
    };

    return {
        plugs,
        store,
        clock,
        requests: () => [...requests],
        lines: () => [...lines],
        events: () => [...emitted],
        release: () => {
            gate.open();
        },
    };
}
