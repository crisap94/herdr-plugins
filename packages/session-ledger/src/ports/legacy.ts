import type { JobContract } from '#src/recap/domain/backend.ts';
import type { LaneMark } from '#src/recap/domain/boundary.ts';
import type { ClosedWhy, Fact, Section, TaskId } from '#src/recap/domain/fact.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane-shape.ts';
import type { CloseOp, Operation, Refusal, UpdateOp } from '#src/recap/domain/ops.ts';
import type { CloseEvidence } from '#src/recap/domain/pipeline.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { FailureCause } from '#src/recap/domain/failure-cause.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { HiddenCounts } from '#src/recap/domain/writer-view.ts';
import type { CompactionWhy, ContextWindowWhy, HistoryWhy, InFlightWhy, SplitWhy } from './capability-reasons.ts';
import type { CuratorMode } from './curators.ts';
import type { Applied } from './ledger.ts';
import type { RunFacts } from './recap-records.ts';
import type { BackgroundSplit, CallKind, ChunkResult, ObservedResult } from './transcripts.ts';
import type { Unknown } from './unknowable.ts';

type CapabilityWhy = HistoryWhy | InFlightWhy | SplitWhy | ContextWindowWhy | CompactionWhy;

const WORDING: Readonly<Record<CapabilityWhy, (agent: string) => string>> = {
    'history-unavailable': (agent) => `no reader for ${agent}`,
    'unregistered-reader': (agent) => `no transcript reader for ${agent}`,
    screen: () => 'screen transcripts do not contain in-flight work',
    'windowed-reader': () => 'windowed replay does not expose in-flight work',
    'in-flight-unavailable': (agent) => `no transcript reader for ${agent}`,
    'claude-background-lost': (agent) => `${agent} background work does not survive a compaction on this version`,
    'codex-cells': (agent) => `${agent} cannot tell background work that survives a compaction`,
    'opencode-parts': (agent) => `${agent} cannot tell background work that survives a compaction`,
    'context-window-unavailable': () => 'context window is unavailable',
    'compaction-unavailable': (agent) => `no compaction plan is registered for ${agent}`,
};

export const capabilityWording = (why: CapabilityWhy, agent: string): string => WORDING[why](agent);

export const splitReason = (why: SplitWhy, agent: string): string => capabilityWording(why, agent);

export const inFlightReason = (why: InFlightWhy, agent: string): string => capabilityWording(why, agent);

export type Curated = { readonly kind: 'curated'; readonly text: string } | Unknown;

export interface Curators {
    readonly backend: string;
    write(document: string, mode?: CuratorMode): Promise<Curated>;
}

export type Enumerated = { readonly kind: 'enumerated'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Enumerators {
    readonly backend: string;
    readonly job: string;
    write(document: string): Promise<Enumerated>;
}

export type Forge = 'gitlab' | 'github';

export interface WebBase { readonly base: string; readonly forge: Forge; }

export type RepoResult =
    | { readonly kind: 'repo'; readonly root: string; readonly branch: string | null; readonly web: WebBase | null }
    | { readonly kind: 'no-repo' }
    | Unknown;

export interface LaneRepo {
    repoOf(cwd: string): Promise<RepoResult>;
}

export interface HistoryFact { readonly section: string; readonly text: string; readonly why: string | null; readonly state: 'open' | 'closed'; readonly closedWhy: string | null; readonly closedAt: number | null; readonly firstAt: number; readonly lastAt: number; }

export interface Ledger {
    openOf(task: TaskId): readonly Fact[];
    recentlyClosed(task: TaskId, sinceMs: number): readonly Fact[];
    allOf(task: TaskId): readonly Fact[];
    keysOf(tab: string): readonly string[];
    historyOf(tab: string, pane: string): readonly HistoryFact[];
}

export interface InputAgent extends LaneHint { readonly id: string; readonly kind: string; readonly label: string; readonly pane: string; readonly source: 'transcript' | 'screen'; }

export interface LaneHint { readonly cwd: string | null; readonly repo: string | null; readonly branch: string | null; readonly files: readonly string[]; }

export interface TaskGroup { readonly id: string; readonly name: string; readonly lanes: readonly string[]; }

export interface InputNote extends AgentNote { readonly agent: string; }

export interface InputTranscript { readonly agent: string; readonly entries: readonly Entry[]; }

export interface InputFact { readonly id: string; readonly section: Section; readonly text: string; readonly state: 'open' | 'closed'; readonly first: number; readonly last: number; readonly why: string | null; readonly ref: string | null; readonly anchor: string | null; readonly agent: string | null; readonly closed: ClosedWhy | null; }

export interface InputLedger { readonly task: string | null; readonly facts: readonly InputFact[]; readonly hidden?: HiddenCounts; }

export interface InputCandidate { readonly section: Section; readonly text: string; readonly why: string | null; readonly ref: string | null; readonly at: number | null; readonly anchor: string; readonly agent: string | null; readonly flagged: boolean; }

export interface RecapInput { readonly tab: { readonly id: string; readonly now: number; readonly zone: string }; readonly agents: readonly InputAgent[]; readonly tasks: readonly TaskGroup[]; readonly ledgers: readonly InputLedger[]; readonly notes: readonly InputNote[]; readonly transcripts: readonly InputTranscript[]; readonly candidates?: readonly InputCandidate[]; }

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

export interface RefusedOperation { readonly task: string; readonly operation: Operation; readonly reasons: readonly { readonly gate: string; readonly reason: string }[]; }

export interface Correction { readonly refused: readonly RefusedOperation[]; readonly problems: readonly string[]; readonly facts: readonly InputFact[]; readonly tasks: boolean; }

export interface RecapRequest { readonly input: RecapInput; readonly language: string; readonly previousLanguage: string; readonly correction?: string; readonly retry?: Correction; readonly closeEvidence?: CloseEvidence; }

export type Written = { readonly kind: 'written'; readonly text: string; readonly costUsd: number } | Unknown;

export interface Summarizer {
    readonly backend: string;
    readonly contract: JobContract;
    write(request: RecapRequest): Promise<Written>;
}

export class TranscriptRegistry {
    private readonly readers: Readonly<Record<string, Transcripts>>;
    private readonly fallback: Transcripts | null;
    private readonly unavailable: (kind: string) => string;

    constructor(readers: Readonly<Record<string, Transcripts>>, fallback: Transcripts | null, unavailable: (kind: string) => string) {
        this.readers = readers;
        this.fallback = fallback;
        this.unavailable = unavailable;
    }

    exact(kind: string): Transcripts | undefined {
        return Object.hasOwn(this.readers, kind) ? this.readers[kind] : undefined;
    }

    readerFor(kind: string): Transcripts | undefined {
        return this.exact(kind) ?? this.fallback ?? undefined;
    }

    unavailableReason(kind: string): string {
        return this.unavailable(kind);
    }
}

export const SCREEN_PREFIX = 'screen:';
export const isScreenSource = (transcript: string): boolean => transcript.startsWith(SCREEN_PREFIX);

export interface Entry { readonly role: 'user' | 'agent' | 'tool'; readonly text: string; readonly at?: number; readonly queued?: boolean; readonly kind?: CallKind; readonly what?: string; }

export interface AgentNote { readonly kind: 'away_summary' | 'compaction'; readonly at: number | null; readonly text: string; }

export interface Position { readonly cursor: number; readonly tail: string | null; }

export interface Mark { readonly kind: 'compacted' | 'compaction-failed'; readonly at: number | null; readonly tokensBefore?: number; readonly tokensAfter?: number; readonly tookMs?: number; readonly trigger?: 'auto' | 'manual'; }

export interface Chunk { readonly kind: 'chunk'; readonly entries: readonly Entry[]; readonly title: string | null; readonly lastPrompt: string | null; readonly claudeRecap: string | null; readonly notes: readonly AgentNote[]; readonly marks?: readonly Mark[]; readonly position: Position; readonly grew: boolean; readonly more?: boolean; }

export type Located = { readonly kind: 'located'; readonly source: string } | Unknown;

export type PromptResult = { readonly kind: 'prompt'; readonly text: string | null } | Unknown;

export type InFlightResult = { readonly kind: 'in-flight'; readonly count: number; readonly background: readonly BackgroundItem[] } | Unknown;

export type InFlightCapability =
    | { readonly kind: 'supported'; readonly split: BackgroundSplit; readonly read: (source: string, budget: number) => Promise<InFlightResult> }
    | { readonly kind: 'unsupported'; readonly why: InFlightWhy };

export interface Transcripts {
    readonly agent: string;
    locate(lane: Lane): Promise<Located>;
    read(source: string, was: Position, budget: number): Promise<ChunkResult>;
    carry?(from: Located, to: Located, at: Position): Promise<Position>;
    latestPrompt(source: string, budget: number): Promise<PromptResult>;
    observed?(source: string, budget: number): Promise<ObservedResult>;
    readonly inFlight: InFlightCapability;
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
