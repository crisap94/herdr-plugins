import {
    instant,
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
    type Workplaces,
    type Writer,
} from '@stateforge-labs/session-ledger';
import { createMemoryStore, type MemoryStore } from './memory-store.ts';
import { gateOf, runnerOf, type Behaviour, type Run } from './behaviour.ts';
import { curatorOf, type CuratedAnswer } from './scripted-curator.ts';

export type { CuratedAnswer } from './scripted-curator.ts';
export type { Behaviour, Settled } from './behaviour.ts';

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
    curated(): readonly string[];
    positions(): readonly Position[];
    settle(): Promise<void>;
    setLocate(next: (session: FollowedSession) => Behaviour<LocatedAnswer>): void;
    setDebounce(next: Debounce): void;
    setRead(next: Behaviour<Chunk>): void;
    setWriter(next: Behaviour<WrittenAnswer>): void;
    setCurator(next: Behaviour<CuratedAnswer> | null): void;
    setOn(next: (event: LedgerEvent) => void): void;
    setRestoreBytes(bytes: number): void;
}

const SETTLE_ROUNDS = 20;

const DEFAULT_READ: Behaviour<Chunk> = {
    kind: 'answer',
    value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: UNREAD, grew: true },
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
    readonly curated: string[];
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
    curator: Behaviour<CuratedAnswer> | null;
    locate: (session: FollowedSession) => Behaviour<LocatedAnswer>;
    on: (event: LedgerEvent) => void;
    restoreBytes: number;
}

const scriptOf = (options: WorldOptions): Script => {
    const scripted = options.locate;
    return {
        debounce: options.debounce ?? { kind: 'off' },
        chunk: options.read ?? DEFAULT_READ,
        written: options.writer,
        curator: null,
        locate: (session: FollowedSession) => scripted ?? { kind: 'answer', value: { kind: 'located', source: session.key } },
        on: () => undefined,
        restoreBytes: Number.MAX_SAFE_INTEGER,
    };
};

type Controls = Pick<EngineWorld, 'setLocate' | 'setDebounce' | 'setRead' | 'setWriter' | 'setCurator' | 'setOn' | 'setRestoreBytes'>;

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
    setCurator: (next: Behaviour<CuratedAnswer> | null) => {
        script.curator = next;
    },
    setOn: (next: (event: LedgerEvent) => void) => {
        script.on = next;
    },
    setRestoreBytes: (bytes: number) => {
        script.restoreBytes = bytes;
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
    const probes: Probes = { located: [], reads: [], positions: [], curated: [] };

    const plugs: EnginePlugs = {
        source: { sessions: sessionsOf(run, (session) => script.locate(session), () => script.chunk, probes) },
        store: { records: store.records, facts: store.facts },
        models: { writer: () => writerOf(run, store, requests, () => script.written), curator: () => curatorOf(run, (document) => probes.curated.push(document), () => script.curator) },
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
            restoreBytes: () => script.restoreBytes,
        },
        on: (event: LedgerEvent) => {
            emitted.push(event);
            script.on(event);
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
        curated: () => [...probes.curated],
        ...controlsOf(script),
        settle: settleWorld,
    };
}
