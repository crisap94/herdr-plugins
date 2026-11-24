import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { SessionMark } from '#src/recap/domain/boundary.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { HarnessKind, SessionKey, ScopeId } from '#src/recap/domain/lane-shape.ts';
import type { Refusal } from '#src/recap/domain/ops.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import type { Cursor, SourcePath } from './transcripts.ts';

export type Running = Brand<boolean, 'Running'>;

export const recapRunningOf = brand<boolean, 'Running'>;

export type Recapped = Brand<boolean, 'Recapped'>;

export const recappedOf = brand<boolean, 'Recapped'>;

export interface SessionCursor {
    readonly pane: SessionKey;
    readonly agent: HarnessKind;
    readonly transcript: SourcePath;
    readonly cursor: Cursor;
    readonly tail: Text | null;
    readonly title: Text | null;
    readonly lastPrompt: Text | null;
    readonly claudeRecap: Text | null;
}

export interface Recap {
    readonly tab: ScopeId;
    readonly lanes: readonly SessionCursor[];
    readonly tasks: readonly RecapTask[];
    readonly at: Instant | null;
    readonly running: Running;
    readonly backend: Text | null;
    readonly error: Text | null;
    readonly costUsd: Usd;
    readonly language: Text;
}

export function blankRecap(tab: ScopeId): Recap {
    return { tab, lanes: [], tasks: [], at: null, running: recapRunningOf(false), backend: null, error: null, costUsd: brand<number, 'Usd'>(0), language: brand<string, 'Text'>('en') };
}

export const hasRecap = (recap: Recap): Recapped => recappedOf(recap.tasks.some((task) => task.markdown !== ''));

export interface RunFacts {
    readonly tab: ScopeId;
    readonly at: Instant;
    readonly cause: RecapCause | 'imported';
    readonly backend: Text | null;
    readonly language: Text;
    readonly costUsd: Usd;
}

export interface RecordedRun extends RunFacts {
    readonly marks?: readonly SessionMark[];
    readonly error: Text | null;
    readonly lanes: readonly SessionCursor[];
    readonly tasks: readonly TaskShape[];
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
    readonly input?: Text;
    readonly gateStats?: GateStats;
}

export interface FailedRun extends RunFacts {
    readonly marks?: readonly SessionMark[];
    readonly error: Text;
    readonly lanes: readonly SessionCursor[];
}

export interface Advance {
    readonly marks?: readonly SessionMark[];
    readonly tab: ScopeId;
    readonly at: Instant;
    readonly error: Text | null;
    readonly lanes: readonly SessionCursor[];
}

export interface LastRun {
    readonly at: Instant;
    readonly cause: RecapCause | 'imported';
}

export interface Records {
    readRecap(tab: ScopeId): Recap | null;
    lastRunOf(tab: ScopeId): LastRun | null;
    beginRun(tab: ScopeId, backend: Text | null, at: Instant): void;
    recordRun(run: RecordedRun): void;
    failRun(run: FailedRun): void;
    advance(move: Advance): void;
}

export type CheckedRecapRecords = Omit<Records, 'readRecap' | 'lastRunOf'> & {
    readonly [K in 'readRecap' | 'lastRunOf']: (...args: Parameters<Records[K]>) => ReturnType<Records[K]> | Unknown;
};
