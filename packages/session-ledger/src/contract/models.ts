import type { Brand, Instant, Text, Unknown, Usd } from './kernel.ts';
import type { Directory, HarnessKind, SessionKey } from './ids.ts';
import type { ClosedWhy, Operation, Section } from './facts.ts';
import type { AgentNote, Entry } from './session.ts';
import type { CloseEvidence, HiddenCounts } from './settings.ts';

export type Flagged = Brand<boolean, 'Flagged'>;

export type Several = Brand<boolean, 'Several'>;

export interface InputAgent extends LaneHint {
    readonly id: Text;
    readonly kind: HarnessKind;
    readonly label: Text;
    readonly key: SessionKey;
    readonly source: 'transcript' | 'screen';
}

export interface LaneHint {
    readonly cwd: Directory | null;
    readonly repo: Directory | null;
    readonly branch: Text | null;
    readonly files: readonly Text[];
}

export interface TaskGroup {
    readonly id: Text;
    readonly name: Text;
    readonly lanes: readonly SessionKey[];
}

export interface InputNote extends AgentNote {
    readonly agent: Text;
}

export interface InputTranscript {
    readonly agent: Text;
    readonly entries: readonly Entry[];
}

export interface InputFact {
    readonly id: Text;
    readonly section: Section;
    readonly text: Text;
    readonly state: 'open' | 'closed';
    readonly first: Instant;
    readonly last: Instant;
    readonly why: Text | null;
    readonly ref: Text | null;
    readonly anchor: Text | null;
    readonly agent: Text | null;
    readonly closed: ClosedWhy | null;
}

export interface InputLedger {
    readonly task: Text | null;
    readonly facts: readonly InputFact[];
    readonly hidden?: HiddenCounts;
}

export interface InputCandidate {
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
    readonly ref: Text | null;
    readonly at: Instant | null;
    readonly anchor: Text;
    readonly agent: Text | null;
    readonly flagged: Flagged;
}

export interface InputScope {
    readonly id: Text;
    readonly now: Instant;
    readonly zone: Text;
}

export interface RecapInput {
    readonly scope: InputScope;
    readonly agents: readonly InputAgent[];
    readonly tasks: readonly TaskGroup[];
    readonly ledgers: readonly InputLedger[];
    readonly notes: readonly InputNote[];
    readonly transcripts: readonly InputTranscript[];
    readonly candidates?: readonly InputCandidate[];
}

export interface GateReason {
    readonly gate: Text;
    readonly reason: Text;
}

export interface RefusedOperation {
    readonly task: Text;
    readonly operation: Operation;
    readonly reasons: readonly GateReason[];
}

export interface Correction {
    readonly refused: readonly RefusedOperation[];
    readonly problems: readonly Text[];
    readonly facts: readonly InputFact[];
    readonly tasks: Several;
}

export interface RecapRequest {
    readonly input: RecapInput;
    readonly language: Text;
    readonly previousLanguage: Text;
    readonly notInLanguage?: readonly InputFact[];
    readonly correction?: Text;
    readonly retry?: Correction;
    readonly closeEvidence?: CloseEvidence;
}

export type Written = { readonly kind: 'written'; readonly text: Text; readonly costUsd: Usd } | Unknown;

export type JobContract = 'strict' | 'free-text';

export type Enumerated = { readonly kind: 'enumerated'; readonly text: Text; readonly costUsd: Usd } | Unknown;

export type Curated = { readonly kind: 'curated'; readonly text: Text } | Unknown;

export type CuratorMode = 'story' | 'reconcile';

export interface Writer { readonly backend: string; readonly contract: JobContract; write(request: RecapRequest): Promise<Written> }
export interface Enumerator { readonly backend: string; readonly job: string; write(document: string): Promise<Enumerated> }
export interface Curator { readonly backend: string; write(document: string, mode?: CuratorMode): Promise<Curated> }
