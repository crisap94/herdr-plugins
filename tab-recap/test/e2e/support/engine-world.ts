import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
    brand, capabilityWording, causeOf, duration, exitCodeOf, FULL_WRITER_VIEW, instant, legacyCreateEngine, must, parseText, textOf, TranscriptRegistry, unknown, writerContext,
    type Debounce, type Instant, type LegacyEngine, type LegacyFollowedSession, type LegacyWriter, type RecapRequest, type ScopeId, type Text, type Written,
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

export const SESSION = '00000000-0000-4000-8000-0000000000e1';

const FIXTURE = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'replay-claude.jsonl'), 'utf8').split('\n').filter((line) => line !== '');
const WITHIN = 20_000;
const EVERY = 20;

export type Step =
    | { readonly kind: 'text'; readonly text: string; readonly cost?: number }
    | { readonly kind: 'ops'; readonly ops: readonly Record<string, unknown>[]; readonly cost?: number }
    | { readonly kind: 'from'; readonly answer: (document: string) => readonly Record<string, unknown>[] }
    | { readonly kind: 'timeout' }
    | { readonly kind: 'failed' };

export const ops = (...list: readonly Record<string, unknown>[]): Step => ({ kind: 'ops', ops: list });

export const add = (section: string, text: string, anchor: string, why?: string): Record<string, unknown> => ({ op: 'add', section, text, anchor, ...(why === undefined ? {} : { why }) });

export interface EngineRun {
    readonly cause: string;
    readonly error: string | null;
    readonly cost: number;
    readonly gates: { readonly refused: Readonly<Record<string, number>>; readonly flagged: Readonly<Record<string, number>>; readonly dropped: number };
}

export interface EngineWorld {
    readonly engine: LegacyEngine;
    readonly store: Store;
    readonly scope: ScopeId;
    readonly lane: LegacyFollowedSession;
    readonly asked: readonly RecapRequest[];
    script(...steps: readonly Step[]): void;
    grow(turns: number): void;
    documents(): readonly string[];
    runs(): readonly EngineRun[];
    facts(): readonly { readonly section: string; readonly text: string; readonly state: string; readonly why: string | null; readonly closedWhy: string | null; readonly agent: string | null; readonly firstAt: number }[];
    until(probe: () => boolean, what: string): Promise<void>;
    swapWriter(writer: LegacyWriter): void;
    close(): void;
}

interface Row { readonly [column: string]: string | number | null }

const optional = (value: string | number | null | undefined): string | null => (value === null || value === undefined ? null : String(value));

const until = async (probe: () => boolean, what: string): Promise<void> => {
    const deadline = Date.now() + WITHIN;
    while (!probe()) {
        if (Date.now() > deadline) { throw new Error(`timed out: ${what}`); }
        await new Promise<void>((resolve) => { setTimeout(resolve, EVERY); });
    }
};

export function engineWorld(options: { readonly debounce?: Debounce; readonly writer?: LegacyWriter; readonly title?: string } = {}): EngineWorld {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-engine-e2e-'));
    const scratch = scratchStore();
    const records = join(dir, 'projects', '-engine', `${SESSION}.jsonl`);
    mkdirSync(dirname(records), { recursive: true });
    writeFileSync(records, '');
    const reader = new ClaudeTranscripts(fsPathOf(dirname(dirname(records))));
    const scope = tabId('w1:t1');
    const lane = seatOf(laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: reader.agent, session: basename(records, '.jsonl'), ...(options.title === undefined ? {} : { title: options.title }) })));
    const debounce = options.debounce;
    const asked: RecapRequest[] = [];
    const script: Step[] = [];
    let written = 0;
    const scripted: LegacyWriter = {
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
    const writers: { current: LegacyWriter } = { current: options.writer ?? scripted };
    const engine = legacyCreateEngine({
        source: { transcripts: new TranscriptRegistry(new Map([[reader.agent, reader]]), null, (kind) => capabilityWording('history-unavailable', must(parseText(kind)))) },
        store: { records: checkedRecords(scratch.store.records), ledger: checkedLedger(scratch.store.ledger) },
        models: { summarizer: () => writers.current },
        environment: { clock: { now: (): Instant => instant(Date.now()) }, repos: NO_REPOS, mint: mintFactId, log: () => undefined },
        settings: { language: (): Text => brand<string, 'Text'>('en'), writerView: () => FULL_WRITER_VIEW, ...(debounce === undefined ? {} : { debounce: (): Debounce => debounce }) },
    });

    const rows = (statement: string): readonly Row[] => (scratch.store.db.prepare(statement).all() as Row[]).map((row) => Object.assign({}, row));
    return {
        engine, store: scratch.store, scope, lane, asked, until,
        script: (...steps) => { script.push(...steps); },
        grow: (turns) => {
            appendFileSync(records, FIXTURE.slice(written * 2, (written + turns) * 2).map((line) => `${line}\n`).join(''));
            written += turns;
        },
        documents: () => asked.map((request) => writerContext(request)),
        runs: () => rows('SELECT cause, error, cost_micro_usd, gate_stats FROM run ORDER BY at, id').map((row) => {
            const stats = JSON.parse(optional(row['gate_stats']) ?? '{"refused":{},"flagged":{},"dropped":0}');
            return { cause: String(row['cause']), error: optional(row['error']), cost: Number(row['cost_micro_usd']) / 1_000_000, gates: stats };
        }),
        facts: () => rows('SELECT section, text, state, why, closed_why, agent, first_at FROM fact ORDER BY first_at, id').map((row) => ({ section: String(row['section']), text: String(row['text']), state: String(row['state']), why: optional(row['why']), closedWhy: optional(row['closed_why']), agent: optional(row['agent']), firstAt: Number(row['first_at']) })),
        swapWriter: (writer) => { writers.current = writer; },
        close: () => {
            scratch.dispose();
            rmSync(dir, { recursive: true, force: true });
        },
    };
}
