import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { Done } from './columns.ts';
import type { Unknown } from './unknowable.ts';

export type AgentState = { readonly kind: 'agent'; readonly agent: string; readonly status: LaneStatus } | Unknown;

export type Prompted = { readonly kind: 'sent' } | { readonly kind: 'blocked' } | Unknown;

export interface PromptWait {
    readonly until: readonly string[];
    readonly timeoutMs: number;
}

export interface Agents {
    status(pane: string): Promise<AgentState>;
    prompt(pane: string, text: string, wait?: PromptWait): Promise<Prompted>;
    typeLine(pane: string, pieces: readonly string[]): Promise<Prompted>;
    askNote(tab: string, pane: string | null): Promise<Done>;
}
