import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import type { Done } from './columns.ts';
import type { Unknown } from './unknowable.ts';

export type AgentState = { readonly kind: 'agent'; readonly agent: string; readonly status: LaneStatus } | Unknown;

export type Prompted = { readonly kind: 'sent' } | { readonly kind: 'blocked' } | Unknown;

export interface PromptWait {
    readonly until: readonly string[];
    readonly timeoutMs: number;
}

export interface PromptBehavior {
    readonly acceptsStall: boolean;
}

export interface LineBehavior extends PromptBehavior {
    readonly enterDelay: Duration;
}

export interface Agents {
    status(pane: string): Promise<AgentState>;
    prompt(pane: string, text: string, wait?: PromptWait, behavior?: PromptBehavior): Promise<Prompted>;
    typeLine(pane: string, line: CompactionLine, behavior: LineBehavior): Promise<Prompted>;
    askNote(tab: string, pane: string | null): Promise<Done>;
}
