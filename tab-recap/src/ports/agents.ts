import type { LaneStatus } from '#src/recap/domain/status.ts';
import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import type { AgentKind, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Duration, Milliseconds } from '#src/recap/domain/time.ts';
import type { Done } from './columns.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type Prompted = { readonly kind: 'sent' } | { readonly kind: 'blocked' } | Unknown;

export interface LineBehavior {
    readonly enterDelay: Duration;
}

export interface AgentFound {
    readonly kind: 'agent';
    readonly agent: AgentKind;
    readonly status: LaneStatus;
}

export type AgentLookup = AgentFound | Unknown;

export interface PromptWaitFor {
    readonly until: readonly Text[];
    readonly timeout: Milliseconds;
}

export type StallStance = 'accepts-stall' | 'refuses-stall';

export interface PromptStance {
    readonly stall: StallStance;
}

export interface AgentPanes {
    status(pane: PaneId): Promise<AgentLookup>;
    prompt(pane: PaneId, text: Text, wait: PromptWaitFor | undefined, behavior: PromptStance): Promise<Prompted>;
    typeLine(pane: PaneId, line: CompactionLine, behavior: LineBehavior): Promise<Prompted>;
    askNote(tab: TabId, pane: PaneId | null): Promise<Done>;
}
