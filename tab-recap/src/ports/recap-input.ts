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

/** Everything the writer is given for one tab and one run (rendered as the `recap_input` document). */
export interface RecapInput {
    readonly tab: { readonly id: string; readonly now: number; readonly zone: string };
    readonly agents: readonly InputAgent[];
    /** only with two or more agents, and only once a grouping exists */
    readonly tasks: readonly TaskGroup[];
    /** the previous recap as the writer last answered it ('' on the first run) */
    readonly previous: string;
    readonly notes: readonly InputNote[];
    readonly transcripts: readonly InputTranscript[];
}
