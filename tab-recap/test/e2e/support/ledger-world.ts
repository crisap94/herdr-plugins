import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    brand, capabilityWording, duration, exitCodeOf, FULL_WRITER_VIEW, instant, legacyCreateEngine, must, parseText, causeOf, textOf, TranscriptRegistry, unknown, writerContext,
    type Instant, type LegacyEngine, type LegacyFollowedSession, type LegacyRecapWritten, type LegacyWriter, type RecapRequest, type ScopeId, type Text, type Workplaces, type Written,
} from '@stateforge-labs/session-ledger';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { checkedLedger, checkedRecords } from '#src/ports/guarded-reads.ts';
import { laneFrom, seatOf } from '#src/recap/domain/lane.ts';
import { NO_REPOS } from '#test/support.ts';
import { fsPathOf } from '#test/fakes/transcript-lines.ts';
import { seenLane } from '#test/support/seen.ts';
import { tabId } from '#test/support/ids.ts';
import type { Step } from './engine-world.ts';

const FIXTURE = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'replay-claude.jsonl'), 'utf8').split('\n').filter((line) => line !== '');
const WAIT = 20_000;
const EVERY = 20;

export interface LaneSpec {
    readonly pane: string;
    readonly cwd?: string | null;
}

export interface LedgerWorld {
    readonly engine: LegacyEngine;
    readonly store: Store;
    readonly scope: ScopeId;
    readonly clock: { now: number };
    readonly transcripts: TranscriptRegistry;
    readonly asked: readonly RecapRequest[];
    lane(pane: string): LegacyFollowedSession;
    script(...steps: readonly Step[]): void;
    grow(pane: string, turns: number): void;
    rows(statement: string): readonly Readonly<Record<string, string | number | null>>[];
    until(probe: () => boolean, what: string): Promise<void>;
    close(): void;
}

export interface LedgerOptions {
    readonly lanes: readonly LaneSpec[];
    readonly repos?: Workplaces;
    readonly keepInput?: () => boolean;
    readonly ran?: (event: LegacyRecapWritten) => void;
    readonly now?: number;
    readonly store?: Store;
}

const flag = brand<boolean, 'KeepInput'>;

const until = async (probe: () => boolean, what: string): Promise<void> => {
    const deadline = Date.now() + WAIT;
    while (!probe()) {
        if (Date.now() > deadline) { throw new Error(`timed out: ${what}`); }
        await new Promise<void>((resolve) => { setTimeout(resolve, EVERY); });
    }
};

export function ledgerWorld(options: LedgerOptions): LedgerWorld {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-ledger-e2e-'));
    const own = options.store === undefined ? scratchStore() : null;
    const store = options.store ?? own?.store;
    if (store === undefined) { throw new Error('a ledger world needs a store'); }
    const root = join(dir, 'projects');
    const folder = join(root, '-ledger');
    mkdirSync(folder, { recursive: true });
    const reader = new ClaudeTranscripts(fsPathOf(root));
    const scope = tabId('w1:t1');
    const clock = { now: options.now ?? 1_800_000_000_000 };
    const files = new Map<string, string>();
    const written = new Map<string, number>();
    const lanes = new Map<string, LegacyFollowedSession>();
    options.lanes.forEach((spec, at) => {
        const session = `00000000-0000-4000-8000-${String(at + 1).padStart(12, '0')}`;
        const file = join(folder, `${session}.jsonl`);
        writeFileSync(file, '');
        files.set(spec.pane, file);
        written.set(spec.pane, 0);
        lanes.set(spec.pane, seatOf(laneFrom(seenLane({ paneId: spec.pane, tabId: 'w1:t1', workspaceId: 'w1', agent: reader.agent, session, ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }) }))));
    });
    const asked: RecapRequest[] = [];
    const script: Step[] = [];
    const writer: LegacyWriter = {
        backend: textOf('fake'),
        contract: 'strict',
        write: (request): Promise<Written> => {
            asked.push(request);
            const step = script.shift() ?? { kind: 'ops', ops: [] };
            switch (step.kind) {
                case 'timeout':
                    return Promise.resolve(unknown({ why: 'timeout', after: duration(1) }));
                case 'failed':
                    return Promise.resolve(unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf(textOf('the model exited')) }));
                case 'text':
                    return Promise.resolve({ kind: 'written', text: textOf(step.text), costUsd: brand<number, 'Usd'>(step.cost ?? 0.1) });
                case 'from':
                    return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: step.answer(writerContext(request)) })), costUsd: brand<number, 'Usd'>(0.1) });
                case 'ops':
                    return Promise.resolve({ kind: 'written', text: textOf(JSON.stringify({ ops: step.ops })), costUsd: brand<number, 'Usd'>(step.cost ?? 0.1) });
                default: {
                    const exhaustive: never = step;
                    return exhaustive;
                }
            }
        },
    };
    const transcripts = new TranscriptRegistry(new Map([[reader.agent, reader]]), null, (kind) => capabilityWording('history-unavailable', must(parseText(kind))));
    const keepInput = options.keepInput;
    const ran = options.ran;
    const engine = legacyCreateEngine({
        source: { transcripts },
        store: { records: checkedRecords(store.records), ledger: checkedLedger(store.ledger) },
        models: { summarizer: () => writer },
        environment: { clock: { now: (): Instant => instant(clock.now) }, repos: options.repos ?? NO_REPOS, mint: mintFactId, log: () => undefined },
        settings: { language: (): Text => brand<string, 'Text'>('en'), writerView: () => FULL_WRITER_VIEW, ...(keepInput === undefined ? {} : { keepInput: (): ReturnType<typeof flag> => flag(keepInput()) }) },
        ...(ran === undefined ? {} : { ran }),
    });
    return {
        engine, store, scope, clock, transcripts, asked, until,
        lane: (pane) => {
            const found = lanes.get(pane);
            if (found === undefined) { throw new Error(`no lane ${pane}`); }
            return found;
        },
        script: (...steps) => { script.push(...steps); },
        grow: (pane, turns) => {
            const file = files.get(pane);
            if (file === undefined) { throw new Error(`no lane ${pane}`); }
            const from = written.get(pane) ?? 0;
            appendFileSync(file, FIXTURE.slice(from * 2, (from + turns) * 2).map((line) => `${line}\n`).join(''));
            written.set(pane, from + turns);
        },
        rows: (statement) => store.db.prepare(statement).all().map((row) => Object.assign({}, row) as Readonly<Record<string, string | number | null>>),
        close: () => {
            own?.dispose();
            rmSync(dir, { recursive: true, force: true });
        },
    };
}
