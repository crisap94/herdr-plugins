import type { LaneMark } from '#src/recap/domain/boundary.ts';
import type { RecapCause } from '#src/recap/domain/intent.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { TaskOps } from '#src/recap/domain/ops.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';

export interface LaneCursor {
    readonly pane: string;
    readonly agent: string;
    readonly transcript: string;
    readonly cursor: number;
    readonly tail: string | null;
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
}

export interface TabRecap {
    readonly tab: string;
    readonly lanes: readonly LaneCursor[];
    readonly tasks: readonly RecapTask[];
    readonly at: number | null;
    readonly running: boolean;
    readonly backend: string | null;
    readonly error: string | null;
    readonly costUsd: number;
    readonly language: string;
}

export function blankRecap(tab: string): TabRecap {
    return { tab, lanes: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' };
}

export const hasRecap = (recap: TabRecap): boolean => recap.tasks.some((task) => task.markdown !== '');

export interface RunFacts {
    readonly tab: string;
    readonly at: number;
    readonly cause: RecapCause | 'imported';
    readonly backend: string | null;
    readonly language: string;
    readonly costUsd: number;
}

export interface RecordedRun extends RunFacts {
    readonly marks?: readonly LaneMark[];
    readonly error: string | null;
    readonly lanes: readonly LaneCursor[];
    readonly tasks: readonly TaskShape[];
    readonly ops: readonly TaskOps[];
    readonly input?: string;
    readonly gateStats?: GateStats;
}

export interface FailedRun extends RunFacts {
    readonly marks?: readonly LaneMark[];
    readonly error: string;
    readonly lanes: readonly LaneCursor[];
}

export interface Advance {
    readonly marks?: readonly LaneMark[];
    readonly tab: string;
    readonly at: number;
    readonly error: string | null;
    readonly lanes: readonly LaneCursor[];
}

export interface RecapRecords {
    readRecap(tab: string): TabRecap | null;
    beginRun(tab: string, backend: string | null, at: number): void;
    recordRun(run: RecordedRun): void;
    failRun(run: FailedRun): void;
    advance(move: Advance): void;
}
