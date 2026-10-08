import type { ClosedWhy, Section } from '#src/recap/domain/fact.ts';
import type { AgentNote, Entry } from './transcripts.ts';

/** One agent (lane) of the tab, as the writer is told about it. `id` is `a1`, `a2`, … and what the rest of the input points at. */
export interface InputAgent extends LaneHint {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly pane: string;
    readonly source: 'transcript' | 'screen';
}

/** What is known of where a lane works. */
export interface LaneHint {
    readonly cwd: string | null;
    /** the git repository's top-level directory, when the cwd is in one */
    readonly repo: string | null;
    readonly branch: string | null;
    /** files the lane edited in what was read (the most recent ones) */
    readonly files: readonly string[];
}

/** The grouping in force: which lanes (by pane) are one task. */
export interface TaskGroup {
    readonly id: string;
    readonly name: string;
    readonly lanes: readonly string[];
}

/** The agent's own note, from the agent with this id. */
export interface InputNote extends AgentNote {
    readonly agent: string;
}

/** What is new for one agent since the last recap, oldest first. */
export interface InputTranscript {
    readonly agent: string;
    readonly entries: readonly Entry[];
}

/** One fact of the ledger as the document shows it. `id` is the document id (`f1`…) the writer's operations refer to. */
export interface InputFact {
    readonly id: string;
    readonly section: Section;
    readonly text: string;
    readonly state: 'open' | 'closed';
    /** epoch ms */
    readonly first: number;
    readonly last: number;
    readonly why: string | null;
    readonly ref: string | null;
    /** the quote from an input that the fact was added with; null when it has none */
    readonly anchor: string | null;
    /** the id of the agent (`a1`) whose work it is, when the tab lists that agent */
    readonly agent: string | null;
    readonly closed: ClosedWhy | null;
}

/** The facts of one task: its open facts and those closed in the last two hours, newest last. `task` is the task's id when the document lists several. */
export interface InputLedger {
    readonly task: string | null;
    readonly facts: readonly InputFact[];
}

/** A fact the first pass found in the new turns, for the writer to reconcile with the ledger. `anchor` is a piece of the input, copied. */
export interface InputCandidate {
    readonly section: Section;
    readonly text: string;
    readonly why: string | null;
    readonly ref: string | null;
    /** epoch ms of the turn it came from */
    readonly at: number | null;
    readonly anchor: string;
    /** the id of the agent (`a1`) whose work it is */
    readonly agent: string | null;
    /** a mandatory candidate (a commit, an edit, an error, a question) that the first pass left unfilled */
    readonly flagged: boolean;
}

/** Everything the writer is given for one tab and one run (rendered as the `recap_input` document). */
export interface RecapInput {
    readonly tab: { readonly id: string; readonly now: number; readonly zone: string };
    readonly agents: readonly InputAgent[];
    /** only with two or more agents, and only once a grouping exists */
    readonly tasks: readonly TaskGroup[];
    /** one ledger per task, in the order of `tasks` (one, task-less, for a tab with one task) */
    readonly ledgers: readonly InputLedger[];
    readonly notes: readonly InputNote[];
    readonly transcripts: readonly InputTranscript[];
    /** only in the reconcile step of the pipeline: what the new turns hold, to reconcile with the ledger; the writer adds only from these */
    readonly candidates?: readonly InputCandidate[];
}
