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
    /** the id of the agent (`a1`) whose work it is, when the tab lists that agent */
    readonly agent: string | null;
    readonly closed: ClosedWhy | null;
}

/** The facts of one task: its open facts and those closed in the last two hours, newest last. `task` is the task's id when the document lists several. */
export interface InputLedger {
    readonly task: string | null;
    readonly facts: readonly InputFact[];
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
}
