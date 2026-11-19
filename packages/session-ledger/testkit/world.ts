import {
    UNREAD,
    type Chunk,
    type Debounce,
    type Position,
    type EnginePlugs,
    type FollowedSession,
    type HarnessKind,
    type LedgerEvent,
    type RecapRequest,
    type Stories,
    type KeptStory,
    type Writer,
} from '@stateforge-labs/session-ledger';
import { createMemoryStore, type MemoryStore } from './memory-store.ts';
import { gateOf, runnerOf, type Behaviour, type Run } from './behaviour.ts';
import { curatorOf, type CuratedAnswer } from './scripted-curator.ts';
import { clockOf, idsOf, sessionsOf, workplacesOf, type LocatedAnswer, type ManualClock, type Probes } from './world-ports.ts';

export type { CuratedAnswer } from './scripted-curator.ts';
export type { Behaviour, Settled } from './behaviour.ts';
export type { LocatedAnswer, ManualClock } from './world-ports.ts';

export type WrittenAnswer = { readonly kind: 'written'; readonly text: string; readonly costUsd: number };

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
    setReadBySource(next: (source: string) => Behaviour<Chunk>): void;
    setWriter(next: Behaviour<WrittenAnswer>): void;
    setCurator(next: Behaviour<CuratedAnswer> | null): void;
    setOn(next: (event: LedgerEvent) => void): void;
    setRestoreBytes(bytes: number): void;
    setLanguage(next: string): void;
    setNoReader(next: HarnessKind | null): void;
    setCarry(next: (from: string, to: string, at: Position) => Position): void;
    setKeepInput(next: () => boolean): void;
    budgets(): readonly number[];
    writerResolutions(): number;
    repoCalls(): readonly string[];
}

const SETTLE_ROUNDS = 20;

const DEFAULT_READ: Behaviour<Chunk> = {
    kind: 'answer',
    value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: UNREAD, grew: true },
};

const storiesOf = (): Stories => {
    const kept = new Map<string, KeptStory>();
    return {
        read: (task) => kept.get(`${task.tab}\u0000${task.key}`) ?? null,
        keep: (run, change) => {
            if (change.story !== null) {
                kept.set(`${run.task.tab}\u0000${run.task.key}`, { text: change.story, at: run.at });
            }
            return { changed: [], refused: [] };
        },
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

interface Script {
    debounce: Debounce;
    chunk: (source: string) => Behaviour<Chunk>;
    written: Behaviour<WrittenAnswer> | undefined;
    curator: Behaviour<CuratedAnswer> | null;
    locate: (session: FollowedSession) => Behaviour<LocatedAnswer>;
    on: (event: LedgerEvent) => void;
    restoreBytes: number;
    language: string;
    noReader: HarnessKind | null;
    carry: (from: string, to: string, at: Position) => Position;
    keepInput: () => boolean;
}

const scriptOf = (options: WorldOptions): Script => {
    const scripted = options.locate;
    return {
        debounce: options.debounce ?? { kind: 'off' },
        chunk: () => options.read ?? DEFAULT_READ,
        written: options.writer,
        curator: null,
        locate: (session: FollowedSession) => scripted ?? { kind: 'answer', value: { kind: 'located', source: session.key } },
        on: () => undefined,
        restoreBytes: Number.MAX_SAFE_INTEGER,
        language: 'en',
        noReader: null,
        carry: () => UNREAD,
        keepInput: () => true,
    };
};

type Controls = Pick<EngineWorld, 'setLocate' | 'setDebounce' | 'setRead' | 'setReadBySource' | 'setWriter' | 'setCurator' | 'setOn' | 'setRestoreBytes' | 'setLanguage' | 'setNoReader' | 'setCarry' | 'setKeepInput'>;

const controlsOf = (script: Script): Controls => ({
    setLocate: (next: (session: FollowedSession) => Behaviour<LocatedAnswer>) => {
        script.locate = next;
    },
    setDebounce: (next: Debounce) => {
        script.debounce = next;
    },
    setRead: (next: Behaviour<Chunk>) => {
        script.chunk = (): Behaviour<Chunk> => next;
    },
    setReadBySource: (next: (source: string) => Behaviour<Chunk>) => {
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
    setLanguage: (next: string) => {
        script.language = next;
    },
    setNoReader: (next: HarnessKind | null) => {
        script.noReader = next;
    },
    setCarry: (next: (from: string, to: string, at: Position) => Position) => {
        script.carry = next;
    },
    setKeepInput: (next: () => boolean) => {
        script.keepInput = next;
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
    const probes: Probes = { located: [], reads: [], positions: [], curated: [], budgets: [], writers: [], repos: [] };
    const workplaces = workplacesOf(probes);

    const plugs: EnginePlugs = {
        source: { sessions: sessionsOf(run, (session) => script.locate(session), (source) => script.chunk(source), probes, { noReader: () => script.noReader, carry: (from, to, at) => script.carry(from, to, at) }) },
        store: { records: store.records, facts: store.facts, stories: storiesOf() },
        models: { writer: () => { probes.writers.push(1); return writerOf(run, store, requests, () => script.written); }, curator: () => curatorOf(run, (document) => probes.curated.push(document), () => script.curator) },
        environment: {
            clock,
            ids: idsOf(),
            workplaces,
            log: (line: string) => {
                lines.push(line);
            },
        },
        settings: {
            language: () => script.language,
            writerView: () => ({ kind: 'full' }),
            debounce: () => script.debounce,
            restoreBytes: () => script.restoreBytes,
            keepInput: () => script.keepInput(),
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
        budgets: () => [...probes.budgets],
        writerResolutions: () => probes.writers.length,
        repoCalls: () => [...probes.repos],
        ...controlsOf(script),
        settle: settleWorld,
    };
}
