import type { Brand, Count, Duration, GateName, Instant, Text, Unknown, Usd } from './kernel.ts';
import type { HarnessKind, ScopeId, SessionKey } from './ids.ts';
import type { Cursor, RecapCause, SourcePath } from './session.ts';
import type { Fact, HistoryFact, Refusal, TaskId } from './facts.ts';

export type Running = Brand<boolean, 'Running'>;

export interface SessionCursor {
    readonly key: SessionKey;
    readonly agent: HarnessKind;
    readonly transcript: SourcePath;
    readonly cursor: Cursor;
    readonly tail: Text | null;
    readonly title: Text | null;
    readonly lastPrompt: Text | null;
    readonly harnessRecap: Text | null;
}

export interface Recap {
    readonly scope: ScopeId;
    readonly sessions: readonly SessionCursor[];
    readonly tasks: readonly RecapTask[];
    readonly at: Instant | null;
    readonly running: Running;
    readonly backend: Text | null;
    readonly error: Text | null;
    readonly costUsd: Usd;
    readonly language: Text;
}

export interface RecapSections {
    readonly goal: Text;
    readonly now: readonly Text[];
    readonly needs: readonly Text[];
    readonly done: readonly Text[];
    readonly decisions: readonly Text[];
    readonly next: readonly Text[];
    readonly links: readonly Text[];
    readonly rules: readonly Text[];
}

export interface RecapTask {
    readonly id: Text;
    readonly name: Text;
    readonly sessions: readonly SessionKey[];
    readonly sections: RecapSections | null;
    readonly markdown: Text;
}

export type TaskShape = Pick<RecapTask, 'id' | 'name' | 'sessions'>;

export type OwnTrigger = 'auto' | 'manual';

export interface SessionMark {
    readonly key: SessionKey;
    readonly at: Instant;
    readonly cursor: Count;
    readonly tokensBefore?: Count;
    readonly tokensAfter?: Count;
    readonly tookMs?: Duration;
    readonly trigger?: OwnTrigger;
}

export interface GateStats {
    readonly refused: Readonly<Record<GateName, Count>>;
    readonly flagged: Readonly<Record<GateName, Count>>;
    readonly dropped: Count;
}

export interface RunFacts {
    readonly scope: ScopeId;
    readonly at: Instant;
    readonly cause: RecapCause | 'imported';
    readonly backend: Text | null;
    readonly language: Text;
    readonly costUsd: Usd;
}

export interface RecordedRun extends RunFacts {
    readonly marks?: readonly SessionMark[];
    readonly error: Text | null;
    readonly sessions: readonly SessionCursor[];
    readonly tasks: readonly TaskShape[];
    readonly changed: readonly Fact[];
    readonly refused: readonly Refusal[];
    readonly input?: Text;
    readonly gateStats?: GateStats;
}

export interface FailedRun extends RunFacts {
    readonly marks?: readonly SessionMark[];
    readonly error: Text;
    readonly sessions: readonly SessionCursor[];
}

export interface Advance {
    readonly marks?: readonly SessionMark[];
    readonly scope: ScopeId;
    readonly at: Instant;
    readonly error: Text | null;
    readonly sessions: readonly SessionCursor[];
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
