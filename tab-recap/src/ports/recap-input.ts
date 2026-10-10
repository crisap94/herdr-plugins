import type { ClosedWhy, Section } from '#src/recap/domain/fact.ts';
import type { AgentNote, Entry } from './transcripts.ts';

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
