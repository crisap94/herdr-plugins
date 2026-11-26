import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brand, capabilityWording, FULL_WRITER_VIEW, instant, legacyCreateEngine as createEngine, must, parseText, textOf, TranscriptRegistry } from '@stateforge-labs/session-ledger';
import type { Instant, LegacyEngine as Engine, LegacyFollowedSession as FollowedSession, LegacySessionReader as SessionReader, LegacyWriter as Writer, RecapRequest, ScopeId, Text, Written } from '@stateforge-labs/session-ledger';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { laneFrom, seatOf } from '#src/recap/domain/lane.ts';
import { NO_REPOS } from '#test/support.ts';
import { tabId } from '#test/support/ids.ts';
import { seenLane } from '#test/support/seen.ts';
import { opencodeFixture } from '#test/opencode-fixture.ts';

const SOURCES = join(import.meta.dirname, '..', '..', 'fixtures', 'sources');

export const recordedLines = (name: string): readonly string[] => readFileSync(join(SOURCES, name), 'utf8').split('\n').filter((line) => line !== '');

export const recordedPath = (name: string): string => join(SOURCES, name);

export const registryOf = (readers: readonly SessionReader[], fallback: SessionReader | null = null): TranscriptRegistry =>
    new TranscriptRegistry(new Map(readers.map((reader): [SessionReader['agent'], SessionReader] => [reader.agent, reader])), fallback, (kind) => capabilityWording('history-unavailable', must(parseText(kind))));

export interface LaneOver {
    readonly session?: string;
    readonly cwd?: string;
    readonly pane?: string;
}

export interface SourceWorld {
    readonly dir: string;
    readonly store: Store;
    readonly requests: RecapRequest[];
    readonly clock: { now: number };
    readonly scope: ScopeId;
    readonly engineOver: (transcripts: TranscriptRegistry) => Engine;
    readonly seat: (agent: string, over?: LaneOver) => FollowedSession;
    readonly lane: (agent: string, over?: LaneOver) => ReturnType<typeof laneFrom>;
    readonly claudeFile: (session: string, from: string) => string;
    readonly codexFile: (from: string) => string;
    readonly dispose: () => void;
}

export interface SourceOptions {
    readonly store?: Store;
    readonly tab?: string;
    readonly pane?: string;
}

export function sourceWorld(options: SourceOptions = {}): SourceWorld {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-sources-'));
    const own = options.store === undefined ? scratchStore() : null;
    const held = options.store ?? own?.store;
    if (held === undefined) {
        throw new Error('a source world needs a store');
    }
    const scratch = { store: held };
    const requests: RecapRequest[] = [];
    const clock = { now: 1 };
    const summarizer: Writer = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request): Promise<Written> => {
            requests.push(request);
            return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: [] })), costUsd: brand<number, 'Usd'>(0) });
        },
    };
    const scope = tabId(options.tab ?? 'src:t1');
    return {
        dir, store: scratch.store, requests, clock, scope,
        engineOver: (transcripts) => createEngine({
            source: { transcripts },
            store: { records: checkedRecords(scratch.store.records), ledger: checkedLedger(scratch.store.ledger) },
            models: { summarizer: () => summarizer },
            environment: { clock: { now: (): Instant => instant(clock.now) }, repos: NO_REPOS, mint: mintFactId, log: () => undefined },
            settings: { language: (): Text => brand<string, 'Text'>('en'), writerView: () => FULL_WRITER_VIEW },
        }),
        lane: (agent, over = {}) => laneFrom(seenLane({ paneId: over.pane ?? options.pane ?? 'src:p1', tabId: String(scope), workspaceId: options.tab === undefined ? 'src' : 'w1', agent, ...(over.session === undefined ? {} : { session: over.session }), ...(over.cwd === undefined ? {} : { cwd: over.cwd }) })),
        seat: (agent, over = {}) => seatOf(laneFrom(seenLane({ paneId: over.pane ?? options.pane ?? 'src:p1', tabId: String(scope), workspaceId: options.tab === undefined ? 'src' : 'w1', agent, ...(over.session === undefined ? {} : { session: over.session }), ...(over.cwd === undefined ? {} : { cwd: over.cwd }) }))),
        claudeFile: (session, from) => {
            const folder = join(dir, 'claude', 'proj');
            mkdirSync(folder, { recursive: true });
            const path = join(folder, `${session}.jsonl`);
            copyFileSync(recordedPath(from), path);
            return path;
        },
        codexFile: (from) => {
            const day = new Date();
            const folder = join(dir, 'codex', String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
            mkdirSync(folder, { recursive: true });
            const path = join(folder, 'rollout-a.jsonl');
            copyFileSync(recordedPath(from), path);
            return path;
        },
        dispose: () => {
            own?.dispose();
            rmSync(dir, { recursive: true, force: true });
        },
    };
}

const HOME_VARIABLES = ['HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'] as const;

export function underScratchHome<T>(build: () => T): T {
    const home = mkdtempSync(join(tmpdir(), 'e2e-home-'));
    const saved = HOME_VARIABLES.map((name) => [name, process.env[name]] as const);
    for (const name of HOME_VARIABLES) {
        process.env[name] = join(home, name);
    }
    try {
        return build();
    } finally {
        for (const [name, value] of saved) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
        rmSync(home, { recursive: true, force: true });
    }
}

export { opencodeFixture };

export type AddMessage = Parameters<ReturnType<typeof opencodeFixture>['add']>[0];
