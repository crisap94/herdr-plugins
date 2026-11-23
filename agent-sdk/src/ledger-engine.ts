import { claudeProjectsRoot } from '@stateforge-labs/harness-adapters/claude';
import {
    createEngine,
    FULL_WRITER_VIEW,
    instant,
    parseHarnessKind,
    type Clock,
    type Engine,
    type HarnessKind,
    type Ids,
    type MintedId,
    type SessionReader,
    type Text,
    type Workplaces,
    type Writer,
} from '@stateforge-labs/session-ledger';
import { claudeReader } from './claude-reader.ts';
import { openLedgerStore, type NewerStore, type StaleStore } from './store/index.ts';

export interface LedgerEngineOptions {
    readonly path: string;
    readonly writer: Writer;
    readonly transcriptsRoot?: string;
    readonly language?: string;
    readonly clock?: Clock;
    readonly ids?: Ids;
    readonly workplaces?: Workplaces;
    readonly log?: (line: Text) => void;
}

export interface LedgerEngine {
    readonly kind: 'ready';
    readonly engine: Engine;
    close(): void;
}

const isText = (raw: string): raw is Text => raw.length >= 0;
const isMintedId = (raw: string): raw is MintedId => raw.length > 0;

const textOf = (raw: string): Text => {
    if (!isText(raw)) {
        throw new Error('agent-sdk: invalid text');
    }
    return raw;
};

const mintedOf = (raw: string): MintedId => {
    if (!isMintedId(raw)) {
        throw new Error('agent-sdk: invalid id');
    }
    return raw;
};

const harnessOf = (): HarnessKind => {
    const parsed = parseHarnessKind('claude');
    if (parsed.kind === 'err') {
        throw new Error('agent-sdk: invalid harness');
    }
    return parsed.value;
};

const SYSTEM_CLOCK: Clock = { now: () => instant(Date.now()) };
const RANDOM_IDS: Ids = { next: () => mintedOf(globalThis.crypto.randomUUID()) };
const NO_REPOS: Workplaces = { repoOf: () => Promise.resolve({ kind: 'no-repo' }) };

export function createLedgerEngine(options: LedgerEngineOptions): LedgerEngine | NewerStore | StaleStore {
    const store = openLedgerStore(options.path);
    if (store.kind !== 'ready') {
        return store;
    }
    const harness = harnessOf();
    const reader: SessionReader = claudeReader({ root: options.transcriptsRoot ?? claudeProjectsRoot() });
    const language = textOf(options.language ?? 'en');
    const log = options.log ?? (() => undefined);
    const engine = createEngine({
        source: {
            sessions: {
                readerFor: (kind) => (kind === harness ? reader : undefined),
                unavailableReason: () => textOf('only Claude transcripts can be read here'),
            },
        },
        store: { records: store.records, facts: store.facts },
        models: { writer: () => options.writer },
        environment: {
            clock: options.clock ?? SYSTEM_CLOCK,
            ids: options.ids ?? RANDOM_IDS,
            workplaces: options.workplaces ?? NO_REPOS,
            log,
        },
        settings: { language: () => language, writerView: () => FULL_WRITER_VIEW },
    });
    return {
        kind: 'ready',
        engine,
        close: () => {
            store.close();
        },
    };
}
