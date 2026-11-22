import type { LaneMark } from '#src/recap/domain/boundary.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { CloseOp, Refusal, UpdateOp } from '#src/recap/domain/ops.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { FailureCause } from '#src/recap/domain/failure-cause.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Applied } from './ledger.ts';
import type { RunFacts } from './recap-records.ts';
import type { Unknown } from './unknowable.ts';

export interface HistoryFact { readonly section: string; readonly text: string; readonly why: string | null; readonly state: 'open' | 'closed'; readonly closedWhy: string | null; readonly closedAt: number | null; readonly firstAt: number; readonly lastAt: number; }

export interface Ledger {
    openOf(task: TaskId): readonly Fact[];
    recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[];
    allOf(task: TaskId): readonly Fact[];
    keysOf(tab: string): readonly string[];
    historyOf(tab: string, pane: string): readonly HistoryFact[];
}

export interface LaneCursor { readonly pane: string; readonly agent: string; readonly transcript: string; readonly cursor: number; readonly tail: string | null; readonly title: string | null; readonly lastPrompt: string | null; readonly claudeRecap: string | null; }

export interface TabRecap { readonly tab: string; readonly lanes: readonly LaneCursor[]; readonly tasks: readonly RecapTask[]; readonly at: number | null; readonly running: boolean; readonly backend: string | null; readonly error: string | null; readonly costUsd: number; readonly language: string; }

export function blankRecap(tab: string): TabRecap {
    return { tab, lanes: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' };
}

export const hasRecap = (recap: TabRecap): boolean => recap.tasks.some((task) => task.markdown !== '');

export interface RecordedRun extends RunFacts { readonly marks?: readonly LaneMark[]; readonly error: string | null; readonly lanes: readonly LaneCursor[]; readonly tasks: readonly TaskShape[]; readonly changed: readonly Fact[]; readonly refused: readonly Refusal[]; readonly input?: string; readonly gateStats?: GateStats; }

export interface FailedRun extends RunFacts { readonly marks?: readonly LaneMark[]; readonly error: string; readonly lanes: readonly LaneCursor[]; }

export interface Advance { readonly marks?: readonly LaneMark[]; readonly tab: string; readonly at: number; readonly error: string | null; readonly lanes: readonly LaneCursor[]; }

export interface LastRun { readonly at: number; readonly cause: RecapCause | 'imported'; }

export interface RecapRecords {
    readRecap(tab: string): TabRecap | null;
    lastRunOf(tab: string): LastRun | null;
    beginRun(tab: string, backend: string | null, at: number): void;
    recordRun(run: RecordedRun): void;
    failRun(run: FailedRun): void;
    advance(move: Advance): void;
}

export interface Story { readonly text: string; readonly at: number; }

export interface CurationRun { readonly task: TaskId; readonly at: number; readonly language: string; }

export interface Stories {
    read(tab: string, task: string): Story | null;
    keep(run: CurationRun, change: { readonly story: string | null; readonly merges: readonly CloseOp[]; readonly reconciled?: readonly (UpdateOp | CloseOp)[] }): Applied;
}

export type Unknowable =
    | { readonly why: 'timeout'; readonly after: Duration }
    | { readonly why: 'unreadable'; readonly detail: FailureCause }
    | { readonly why: 'unreachable'; readonly detail: FailureCause }
    | { readonly why: 'not-found'; readonly what: string }
    | { readonly why: 'failed'; readonly code: number; readonly detail: FailureCause }
    | { readonly why: 'lease'; readonly after: Duration };

export function isUnknown(result: { readonly kind: string }): result is Unknown {
    return result.kind === 'unknown';
}

export function saying(unknowable: Unknowable): string {
    switch (unknowable.why) {
        case 'timeout':
            return `timed out after ${unknowable.after} ms`;
        case 'unreadable':
            return `unreadable: ${unknowable.detail}`;
        case 'unreachable':
            return `unreachable: ${unknowable.detail}`;
        case 'not-found':
            return `${unknowable.what} not found`;
        case 'failed':
            return `exited ${unknowable.code}: ${unknowable.detail}`;
        case 'lease':
            return `another tool is typing into the pane (waited ${unknowable.after} ms for its lease)`;
        default: {
            const exhaustive: never = unknowable;
            return String(exhaustive);
        }
    }
}
