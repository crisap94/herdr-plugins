import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Done } from './columns.ts';
import type { Unknown } from './unknowable.ts';

/** What herdr says of one agent: its kind and where it stands. */
export type AgentState = { readonly kind: 'agent'; readonly agent: string; readonly status: LaneStatus } | Unknown;

/** `blocked`: herdr refused, the agent is on a question or approval dialog and nothing was typed. */
export type Prompted = { readonly kind: 'sent' } | { readonly kind: 'blocked' } | Unknown;

/** Wait, after typing, until the agent is in one of these states (herdr's words). */
export interface PromptWait {
    readonly until: readonly string[];
    readonly timeoutMs: number;
}

/** The only way anything is ever typed into an agent: the operator asked for it, for one agent at a time. */
export interface Agents {
    status(pane: string): Promise<AgentState>;
    prompt(pane: string, text: string, wait?: PromptWait): Promise<Prompted>;
    /** Type one line (no line break) and press Enter, without pasting: what `/compact <instructions>` of Claude Code needs. */
    typeLine(pane: string, line: string): Promise<Prompted>;
    /** The compaction popup, over everything, for the agent in `pane` of `tab` (pane is null when none is known). */
    askNote(tab: string, pane: string | null): Promise<Done>;
}
