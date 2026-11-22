import type { AgentKind, Brand, Count, GateName, Instant, PaneId, TabId, Text, Unknown, Usd } from './kernel.ts';
import type { ScopeId, SessionKey } from './ids.ts';
import type { Cursor, RecapCause, SourcePath } from './session.ts';
import type { Fact, HistoryFact, Refusal, TaskId } from './facts.ts';

export type Running = Brand<boolean, 'Running'>;

export interface SessionCursor {
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly transcript: SourcePath;
    readonly cursor: Cursor;
    readonly tail: Text | null;
    readonly title: Text | null;
    readonly lastPrompt: Text | null;
    readonly claudeRecap: Text | null;
}

export interface Recap {
    readonly tab: TabId;
    readonly lanes: readonly SessionCursor[];
    readonly tasks: readonly RecapTask[];
    readonly at: Instant | null;
    readonly running: Running;
    readonly backend: Text | null;
    readonly error: Text | null;
    readonly costUsd: Usd;
    readonly language: Text;
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
    readonly tab: TabId;
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
    readonly tab: TabId;
    readonly at: Instant;
    readonly error: Text | null;
    readonly lanes: readonly SessionCursor[];
}

export interface LastRun {
    readonly at: Instant;
    readonly cause: RecapCause | 'imported';
}

export interface Story {
    readonly text: Text;
    readonly at: Instant;
}

export interface Records {
    readRecap(scope: ScopeId): Recap | null | Unknown;
    lastRunOf(scope: ScopeId): LastRun | null | Unknown;
    beginRun(scope: ScopeId, backend: Text | null, at: Instant): void;
    recordRun(run: RecordedRun): void;
    failRun(run: FailedRun): void;
    advance(move: Advance): void;
}
export interface FactStore {
    openOf(task: TaskId): readonly Fact[] | Unknown;
    recentlyClosed(task: TaskId, sinceMs: Instant): readonly Fact[] | Unknown;
    allOf(task: TaskId): readonly Fact[] | Unknown;
    keysOf(scope: ScopeId): readonly string[] | Unknown;
    historyOf(scope: ScopeId, key: SessionKey): readonly HistoryFact[];
}
