import { err, ok } from '#src/protocol/result.ts';
import type { Result } from '#src/protocol/result.ts';
import { parseAgentKind, parseCompactionId, parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseDuration, parseInstant } from '#src/recap/domain/time.ts';
export type ActiveStage = 'briefing' | 'compacting' | 'restoring';
export type EndStage = 'compacted' | 'failed' | 'unconfirmed' | 'skipped';
export type Stage = ActiveStage | EndStage;

export type BriefOrigin = 'written' | 'template';

export interface CompactionRecord {
    readonly id: string;
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly brief: BriefOrigin | null;
    readonly writer: string | null;
    readonly templateWhy: string | null;
    readonly startedAt: number;
    readonly stageAt: number;
    readonly finishedAt: number | null;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
    readonly retried: boolean;
    readonly queued: boolean;
    readonly why: string | null;
    readonly origin: Origin;
}

export interface BeginCompaction {
    readonly tab: string;
    readonly pane: string;
    readonly agent: string;
    readonly stage: Stage;
    readonly at: number;
    readonly writer?: string | null;
    readonly why?: string | null;
    readonly origin?: Origin;
    readonly answer?: string | null;
}

export interface StageFacts {
    readonly at: number;
    readonly brief?: BriefOrigin | null;
    readonly writer?: string | null;
    readonly templateWhy?: string | null;
    readonly queued?: boolean;
}

export interface CompactionEnd {
    readonly stage: EndStage;
    readonly at: number;
    readonly tokensBefore?: number | null;
    readonly tokensAfter?: number | null;
    readonly tookMs?: number | null;
    readonly retried?: boolean;
    readonly why?: string | null;
}

export interface CompactionView {
    shownFor(tab: string): readonly CompactionRecord[];
    autoInProgress(): boolean;
}

export interface CompactionRecords extends CompactionView {
    begin(start: BeginCompaction): string;
    advance(id: string, stage: ActiveStage, facts: StageFacts): void;
    finish(id: string, end: CompactionEnd): void;
    dismissTurn(tab: string, pane: string, at: number): void;
    interrupted(at: number, why: string): number;
}

const STAGES: readonly Stage[] = ['briefing', 'compacting', 'restoring', 'compacted', 'failed', 'unconfirmed', 'skipped'];
const BRIEF_ORIGINS: readonly BriefOrigin[] = ['written', 'template'];
const ORIGINS: readonly Origin[] = ['operator', 'auto', 'request'];

interface Row {
    readonly [key: string]: unknown;
}

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

type CompactionIdentity = Pick<CompactionRecord, 'id' | 'tab' | 'pane' | 'agent' | 'stage' | 'brief'>;
type CompactionNotes = Pick<CompactionRecord, 'writer' | 'templateWhy' | 'why'>;
type CompactionFlags = Pick<CompactionRecord, 'retried' | 'queued' | 'origin'>;
type CompactionTimes = Pick<CompactionRecord, 'startedAt' | 'stageAt' | 'finishedAt'>;
type CompactionMeasures = Pick<CompactionRecord, 'tokensBefore' | 'tokensAfter' | 'tookMs'>;

export function parseStage(input: unknown): Result<Stage, ParseFailure> {
    const found = STAGES.find((stage) => stage === input);
    return found === undefined ? err({ kind: 'out-of-range' }) : ok(found);
}

export function parseBriefOrigin(input: unknown): Result<BriefOrigin, ParseFailure> {
    const found = BRIEF_ORIGINS.find((origin) => origin === input);
    return found === undefined ? err({ kind: 'out-of-range' }) : ok(found);
}

function identityOf(row: Row): Result<CompactionIdentity, ParseFailure> {
    const id = parseCompactionId(row.id);
    if (id.kind === 'err') return id;
    const tab = parseTabId(row.tab);
    if (tab.kind === 'err') return tab;
    const pane = parsePaneId(row.pane);
    if (pane.kind === 'err') return pane;
    const agent = parseAgentKind(row.agent);
    if (agent.kind === 'err') return agent;
    const stage = parseStage(row.stage);
    if (stage.kind === 'err') return stage;
    const brief = row.brief === null ? ok(null) : parseBriefOrigin(row.brief);
    if (brief.kind === 'err') return brief;
    return ok({ id: id.value, tab: tab.value, pane: pane.value, agent: agent.value, stage: stage.value, brief: brief.value });
}

function notesOf(row: Row): Result<CompactionNotes, ParseFailure> {
    const writer = row.writer === null ? ok(null) : parseText(row.writer);
    if (writer.kind === 'err') return writer;
    const templateWhy = row.templateWhy === null ? ok(null) : parseText(row.templateWhy);
    if (templateWhy.kind === 'err') return templateWhy;
    const why = row.why === null ? ok(null) : parseText(row.why);
    if (why.kind === 'err') return why;
    return ok({ writer: writer.value, templateWhy: templateWhy.value, why: why.value });
}

function flagsOf(row: Row): Result<CompactionFlags, ParseFailure> {
    const origin = ORIGINS.find((value) => value === row.origin);
    if (origin === undefined) return err({ kind: 'out-of-range' });
    if (typeof row.retried !== 'boolean' || typeof row.queued !== 'boolean') return err({ kind: 'not-a-row' });
    return ok({ retried: row.retried, queued: row.queued, origin });
}

function timesOf(row: Row): Result<CompactionTimes, ParseFailure> {
    const startedAt = parseInstant(row.startedAt);
    if (startedAt.kind === 'err') return startedAt;
    const stageAt = parseInstant(row.stageAt);
    if (stageAt.kind === 'err') return stageAt;
    const finishedAt = row.finishedAt === null ? ok(null) : parseInstant(row.finishedAt);
    if (finishedAt.kind === 'err') return finishedAt;
    return ok({ startedAt: startedAt.value, stageAt: stageAt.value, finishedAt: finishedAt.value });
}

function measuresOf(row: Row): Result<CompactionMeasures, ParseFailure> {
    const tokensBefore = row.tokensBefore === null ? ok(null) : parseCount(row.tokensBefore);
    if (tokensBefore.kind === 'err') return tokensBefore;
    const tokensAfter = row.tokensAfter === null ? ok(null) : parseCount(row.tokensAfter);
    if (tokensAfter.kind === 'err') return tokensAfter;
    const tookMs = row.tookMs === null ? ok(null) : parseDuration(row.tookMs);
    if (tookMs.kind === 'err') return tookMs;
    return ok({ tokensBefore: tokensBefore.value, tokensAfter: tokensAfter.value, tookMs: tookMs.value });
}

export function parseCompactionRecord(input: unknown): Result<CompactionRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const identity = identityOf(input);
    if (identity.kind === 'err') return identity;
    const notes = notesOf(input);
    if (notes.kind === 'err') return notes;
    const flags = flagsOf(input);
    if (flags.kind === 'err') return flags;
    const times = timesOf(input);
    if (times.kind === 'err') return times;
    const measures = measuresOf(input);
    if (measures.kind === 'err') return measures;
    return ok({ ...identity.value, ...notes.value, ...flags.value, ...times.value, ...measures.value });
}
