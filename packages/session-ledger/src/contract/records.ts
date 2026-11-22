import type { Count, GateName, Unknown } from './kernel.ts';
import type { ScopeId, SessionKey } from './ids.ts';
import type { RecapCause } from './session.ts';
import type { Fact, HistoryFact, Refusal, TaskId } from './facts.ts';

export interface SessionCursor {
    readonly pane: string;
    readonly agent: string;
    readonly transcript: string;
    readonly cursor: number;
    readonly tail: string | null;
    readonly title: string | null;
    readonly lastPrompt: string | null;
    readonly claudeRecap: string | null;
}

export interface Recap {
    readonly tab: string;
    readonly lanes: readonly SessionCursor[];
    readonly tasks: readonly RecapTask[];
    readonly at: number | null;
    readonly running: boolean;
    readonly backend: string | null;
    readonly error: string | null;
    readonly costUsd: number;
    readonly language: string;
}

export interface RecapSections {
    readonly goal: string;
    readonly now: readonly string[];
    readonly needs: readonly string[];
    readonly done: readonly string[];
    readonly decisions: readonly string[];
    readonly next: readonly string[];
    readonly links: readonly string[];
    readonly rules: readonly string[];
}

export interface RecapTask {
    readonly id: string;
    readonly name: string;
    readonly lanes: readonly string[];
    readonly sections: RecapSections | null;
    readonly markdown: string;
}

export type TaskShape = Pick<RecapTask, 'id' | 'name' | 'lanes'>;

export type OwnTrigger = 'auto' | 'manual';

export interface SessionMark {
    readonly pane: string;
    readonly at: number;
    readonly cursor: number;
    readonly tokensBefore?: number;
    readonly tokensAfter?: number;
    readonly tookMs?: number;
    readonly trigger?: OwnTrigger;
}

export interface GateStats {
    readonly refused: Readonly<Record<GateName, Count>>;
    readonly flagged: Readonly<Record<GateName, Count>>;
    readonly dropped: Count;
}

export interface RunFacts {
    readonly tab: string;
    readonly at: number;
    readonly cause: RecapCause | 'imported';
    readonly backend: string | null;
    readonly language: string;
    readonly costUsd: number;
}

export interface RecordedRun extends RunFacts {
    readonly marks?: readonly SessionMark[];
    readonly error: string | null;
    readonly lanes: readonly SessionCursor[];
    readonly tasks: readonly TaskShape[];
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
    readonly input?: string;
    readonly gateStats?: GateStats;
}

export interface FailedRun extends RunFacts {
    readonly marks?: readonly SessionMark[];
    readonly error: string;
    readonly lanes: readonly SessionCursor[];
}

export interface Advance {
    readonly marks?: readonly SessionMark[];
    readonly tab: string;
    readonly at: number;
    readonly error: string | null;
    readonly lanes: readonly SessionCursor[];
}

export interface LastRun {
    readonly at: number;
    readonly cause: RecapCause | 'imported';
}

export interface Story {
    readonly text: string;
    readonly at: number;
}

export interface Records {
    readRecap(scope: ScopeId): Recap | null | Unknown;
    lastRunOf(scope: ScopeId): LastRun | null | Unknown;
    beginRun(scope: ScopeId, backend: string | null, at: number): void;
    recordRun(run: RecordedRun): void;
    failRun(run: FailedRun): void;
    advance(move: Advance): void;
}
export interface FactStore {
    openOf(task: TaskId): readonly Fact[] | Unknown;
    recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[] | Unknown;
    allOf(task: TaskId): readonly Fact[] | Unknown;
    keysOf(scope: ScopeId): readonly string[] | Unknown;
    historyOf(scope: ScopeId, key: SessionKey): readonly HistoryFact[];
}
