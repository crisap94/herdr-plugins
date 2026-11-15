import type { Unknown } from './kernel.ts';
import type { ClosedWhy, Operation, Section } from './facts.ts';
import type { AgentNote, Entry } from './session.ts';
import type { CloseEvidence, HiddenCounts } from './settings.ts';

export interface InputAgent extends LaneHint {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly pane: string;
    readonly source: 'transcript' | 'screen';
}

export interface LaneHint {
    readonly cwd: string | null;
    readonly repo: string | null;
    readonly branch: string | null;
    readonly files: readonly string[];
}

export interface TaskGroup {
    readonly id: string;
    readonly name: string;
    readonly lanes: readonly string[];
}

export interface InputNote extends AgentNote {
    readonly agent: string;
}

export interface InputTranscript {
    readonly agent: string;
    readonly entries: readonly Entry[];
}

export interface InputFact {
    readonly id: string;
    readonly section: Section;
    readonly text: string;
    readonly state: 'open' | 'closed';
    readonly first: number;
    readonly last: number;
    readonly why: string | null;
    readonly ref: string | null;
    readonly anchor: string | null;
    readonly agent: string | null;
    readonly closed: ClosedWhy | null;
}

export interface InputLedger {
    readonly task: string | null;
    readonly facts: readonly InputFact[];
    readonly hidden?: HiddenCounts;
}

export interface InputCandidate {
    readonly section: Section;
    readonly text: string;
    readonly why: string | null;
    readonly ref: string | null;
    readonly at: number | null;
    readonly anchor: string;
    readonly agent: string | null;
    readonly flagged: boolean;
}

export interface RecapInput {
    readonly tab: { readonly id: string; readonly now: number; readonly zone: string };
    readonly agents: readonly InputAgent[];
    readonly tasks: readonly TaskGroup[];
    readonly ledgers: readonly InputLedger[];
    readonly notes: readonly InputNote[];
    readonly transcripts: readonly InputTranscript[];
    readonly candidates?: readonly InputCandidate[];
}

export interface RefusedOperation {
    readonly task: string;
    readonly operation: Operation;
    readonly reasons: readonly { readonly gate: string; readonly reason: string }[];
}

export interface Correction {
    readonly refused: readonly RefusedOperation[];
    readonly problems: readonly string[];
    readonly facts: readonly InputFact[];
    readonly tasks: boolean;
}

export interface RecapRequest {
    readonly input: RecapInput;
    readonly language: string;
    readonly previousLanguage: string;
    readonly correction?: string;
    readonly retry?: Correction;
    readonly closeEvidence?: CloseEvidence;
}

export type Written = { readonly kind: 'written'; readonly text: string; readonly costUsd: number } | Unknown;

export type JobContract = 'strict' | 'free-text';

export type Enumerated = { readonly kind: 'enumerated'; readonly text: string; readonly costUsd: number } | Unknown;

export type Curated = { readonly kind: 'curated'; readonly text: string } | Unknown;

export type CuratorMode = 'story' | 'reconcile';

export interface Writer { readonly backend: string; readonly contract: JobContract; write(request: RecapRequest): Promise<Written> }
export interface Enumerator { readonly backend: string; readonly job: string; write(document: string): Promise<Enumerated> }
export interface Curator { readonly backend: string; write(document: string, mode?: CuratorMode): Promise<Curated> }
