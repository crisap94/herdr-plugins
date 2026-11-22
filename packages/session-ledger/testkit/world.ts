import {
    UNREAD,
    type Chunk,
    type Debounce,
    type Pacing,
    type Position,
    type EnginePlugs,
    type FollowedSession,
    type HarnessKind,
    type LedgerEvent,
    type PositiveCount,
    type SettingsPlugs,
    type RecapRequest,
    type StoryChange,
    type StoryRepair,
} from '@stateforge-labs/session-ledger';
import { createMemoryStore, type MemoryStore } from './memory-store.ts';
import { storiesOf, writerOf, type WrittenAnswer } from './world-fakes.ts';
import { gateOf, runnerOf, type Behaviour } from './behaviour.ts';
import { curatorOf, type CuratedAnswer, type CuratorCall } from './scripted-curator.ts';
import { clockOf, idsOf, sessionsOf, workplacesOf, type LocatedAnswer, type ManualClock, type Probes } from './world-ports.ts';
import { byteCount, grew, positiveCount, text } from './values.ts';

export type { CuratedAnswer, CuratorCall } from './scripted-curator.ts';
export type { WrittenAnswer } from './world-fakes.ts';
export type { Behaviour, Settled } from './behaviour.ts';
export type { LocatedAnswer, ManualClock } from './world-ports.ts';

export interface WorldOptions {
    readonly writer?: Behaviour<WrittenAnswer>;
    readonly locate?: Behaviour<LocatedAnswer>;
    readonly read?: Behaviour<Chunk>;
    readonly debounce?: Debounce;
    readonly pacing?: Pacing;
    readonly visible?: boolean;
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
    curatorCalls(): readonly CuratorCall[];
    changes(): readonly StoryChange[];
    positions(): readonly Position[];
    settle(): Promise<void>;
    setLocate(next: (session: FollowedSession) => Behaviour<LocatedAnswer>): void;
    setDebounce(next: Debounce): void;
    setPacing(next: Pacing): void;
    setVisible(next: boolean): void;
    setRead(next: Behaviour<Chunk>): void;
    setReadBySource(next: (source: string) => Behaviour<Chunk>): void;
    setWriter(next: Behaviour<WrittenAnswer>): void;
    setCurator(next: Behaviour<CuratedAnswer> | null): void;
    setCuratorBy(next: ((call: CuratorCall) => Behaviour<CuratedAnswer>) | null): void;
    setStoryRepair(next: StoryRepair): void;
    setReconcileEvery(next: number | null): void;
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
    value: { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: UNREAD, grew: grew(true) },
};

interface Script {
    debounce: Debounce;
    pacing: Pacing;
    visible: boolean;
    chunk: (source: string) => Behaviour<Chunk>;
    written: Behaviour<WrittenAnswer> | undefined;
    curator: Behaviour<CuratedAnswer> | null;
    curatorBy: ((call: CuratorCall) => Behaviour<CuratedAnswer>) | null;
    storyRepair: StoryRepair;
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
        pacing: options.pacing ?? { kind: 'turn' },
        visible: options.visible ?? true,
        chunk: () => options.read ?? DEFAULT_READ,
        written: options.writer,
        curator: null,
        curatorBy: null,
        storyRepair: 'off',
        locate: (session: FollowedSession) => scripted ?? { kind: 'answer', value: { kind: 'located', source: session.key } },
        on: () => undefined,
        restoreBytes: Number.MAX_SAFE_INTEGER,
        language: 'en',
        noReader: null,
        carry: () => UNREAD,
        keepInput: () => true,
    };
};

type Mutable<Shape> = { -readonly [Key in keyof Shape]: Shape[Key] };

type Controls = Pick<EngineWorld, 'setLocate' | 'setDebounce' | 'setPacing' | 'setVisible' | 'setRead' | 'setReadBySource' | 'setWriter' | 'setCurator' | 'setCuratorBy' | 'setStoryRepair' | 'setReconcileEvery' | 'setOn' | 'setRestoreBytes' | 'setLanguage' | 'setNoReader' | 'setCarry' | 'setKeepInput'>;

const controlsOf = (script: Script, settings: Mutable<SettingsPlugs>): Controls => ({
    setLocate: (next: (session: FollowedSession) => Behaviour<LocatedAnswer>) => {
        script.locate = next;
    },
    setDebounce: (next: Debounce) => {
        script.debounce = next;
    },
    setPacing: (next: Pacing) => {
        script.pacing = next;
    },
    setVisible: (next: boolean) => {
        script.visible = next;
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
    setCuratorBy: (next: ((call: CuratorCall) => Behaviour<CuratedAnswer>) | null) => {
        script.curatorBy = next;
    },
    setStoryRepair: (next: StoryRepair) => {
        script.storyRepair = next;
    },
    setReconcileEvery: (next: number | null): void => {
        if (next === null) {
            delete settings.reconcileEvery;
        } else {
            const every = positiveCount(next);
            settings.reconcileEvery = (): PositiveCount => every;
        }
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

const settingsOf = (script: Script): SettingsPlugs => ({
    language: () => text(script.language),
    writerView: () => ({ kind: 'full' }),
    debounce: () => script.debounce,
    pacing: () => script.pacing,
    visible: () => (script.visible ? 'shown' : 'hidden'),
    restoreBytes: () => byteCount(script.restoreBytes),
    keepInput: () => (script.keepInput() ? 'keep' : 'drop'),
    storyRepair: () => script.storyRepair,
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
    const changes: StoryChange[] = [];
    const calls: CuratorCall[] = [];
    const probes: Probes = { located: [], reads: [], positions: [], curated: [], budgets: [], writers: [], repos: [] };
    const workplaces = workplacesOf(probes);

    const settings = settingsOf(script);
    const plugs: EnginePlugs = {
        source: { sessions: sessionsOf(run, (session) => script.locate(session), (source) => script.chunk(source), probes, { noReader: () => script.noReader, carry: (from, to, at) => script.carry(from, to, at) }) },
        store: { records: store.records, facts: store.facts, stories: storiesOf(changes) },
        models: { writer: () => { probes.writers.push(1); return writerOf(run, store, requests, () => script.written); }, curator: () => curatorOf(run, (call) => { probes.curated.push(call.document); calls.push(call); }, () => script.curator !== null || script.curatorBy !== null, (call) => script.curatorBy?.(call) ?? script.curator) },
        environment: {
            clock,
            ids: idsOf(),
            workplaces,
            log: (line: string) => {
                lines.push(line);
            },
        },
        settings,
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
        curatorCalls: () => [...calls],
        changes: () => [...changes],
        budgets: () => [...probes.budgets],
        writerResolutions: () => probes.writers.length,
        repoCalls: () => [...probes.repos],
        ...controlsOf(script, settings),
        settle: settleWorld,
    };
}
