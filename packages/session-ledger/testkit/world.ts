import {
    instant,
    unknown as unknownOf,
    UNREAD,
    type Chunk,
    type Clock,
    type Debounce,
    type Position,
    type EnginePlugs,
    type FollowedSession,
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
    readonly debounce?: Debounce;
}

export interface EngineWorld {
    readonly plugs: EnginePlugs;
    readonly store: MemoryStore;
    readonly clock: ManualClock;
    requests(): readonly RecapRequest[];
    lines(): readonly string[];
    events(): readonly LedgerEvent[];
    release(): void;
    located(): readonly FollowedSession[];
    reads(): readonly string[];
    positions(): readonly Position[];
    settle(): Promise<void>;
    setLocate(next: (session: FollowedSession) => Behaviour<LocatedAnswer>): void;
    setDebounce(next: Debounce): void;
    setRead(next: Behaviour<Chunk>): void;
    setWriter(next: Behaviour<WrittenAnswer>): void;
}

const SETTLE_ROUNDS = 20;

const DEFAULT_READ: Behaviour<Chunk> = {
    kind: 'answer',
    value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: UNREAD, grew: true },
};

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

interface Probes {
    readonly located: FollowedSession[];
    readonly reads: string[];
    readonly positions: Position[];
}

const sessionsOf = (run: Run, locateOf: (session: FollowedSession) => Behaviour<LocatedAnswer>, readOf: () => Behaviour<Chunk>, probes: Probes): SessionSource => {
    const readerFor = (harness: HarnessKind): SessionReader => ({
        harness,
        locate: (session: FollowedSession) => {
            probes.located.push(session);
            return run(locateOf(session));
        },
        read: (source: string, was: Position) => {
            probes.reads.push(source);
            probes.positions.push(was);
            return run(readOf());
        },
    });
    return {
        readerFor,
        unavailableReason: (harness: HarnessKind) => `no scripted reader for ${harness}`,
    };
};

const writerOf = (run: Run, store: MemoryStore, requests: RecapRequest[], behaviour: () => Behaviour<WrittenAnswer> | undefined): Writer => ({
    backend: 'scripted',
    contract: 'free-text',
    write: (request: RecapRequest) => {
        requests.push(request);
        const scripted = behaviour();
        if (scripted !== undefined) {
            return run(scripted);
        }
        return run({ kind: 'answer', value: { kind: 'written', text: store.markdown(), costUsd: 0 } });
    },
});

const workplaces: Workplaces = {
    repoOf: () => Promise.resolve<RepoResult>({ kind: 'no-repo' }),
};

interface Script {
    debounce: Debounce;
    chunk: Behaviour<Chunk>;
    written: Behaviour<WrittenAnswer> | undefined;
    locate: (session: FollowedSession) => Behaviour<LocatedAnswer>;
}

const scriptOf = (options: WorldOptions): Script => {
    const scripted = options.locate;
    return {
        debounce: options.debounce ?? { kind: 'off' },
        chunk: options.read ?? DEFAULT_READ,
        written: options.writer,
        locate: (session: FollowedSession) => scripted ?? { kind: 'answer', value: { kind: 'located', source: session.key } },
    };
};

type Controls = Pick<EngineWorld, 'setLocate' | 'setDebounce' | 'setRead' | 'setWriter'>;

const controlsOf = (script: Script): Controls => ({
    setLocate: (next: (session: FollowedSession) => Behaviour<LocatedAnswer>) => {
        script.locate = next;
    },
    setDebounce: (next: Debounce) => {
        script.debounce = next;
    },
    setRead: (next: Behaviour<Chunk>) => {
        script.chunk = next;
    },
    setWriter: (next: Behaviour<WrittenAnswer>) => {
        script.written = next;
    },
});

const settleWorld = async (): Promise<void> => {
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }
};

export function createEngineWorld(options: WorldOptions = {}): EngineWorld {
    const script = scriptOf(options);
    const gate = gateOf();
    const run = runnerOf(gate.opened);
    const store = createMemoryStore();
    const clock = clockOf();
    const lines: string[] = [];
    const emitted: LedgerEvent[] = [];
    const requests: RecapRequest[] = [];
    const probes: Probes = { located: [], reads: [], positions: [] };

    const plugs: EnginePlugs = {
        source: { sessions: sessionsOf(run, (session) => script.locate(session), () => script.chunk, probes) },
        store: { records: store.records, facts: store.facts },
        models: { writer: () => writerOf(run, store, requests, () => script.written) },
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
            debounce: () => script.debounce,
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
        located: () => [...probes.located],
        reads: () => [...probes.reads],
        positions: () => [...probes.positions],
        ...controlsOf(script),
        settle: settleWorld,
    };
}
