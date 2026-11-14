import type { Instant } from './kernel.ts';
import type { ScopeId, SessionKey } from './ids.ts';
import type { RecapCause } from './session.ts';
import type { Fact, TaskId } from './facts.ts';

export interface TurnRecorded { readonly kind: 'turn-recorded'; readonly scope: ScopeId; readonly key: SessionKey; readonly at: Instant }
export interface AccomplishmentEstablished {
    readonly kind: 'accomplishment-established';
    readonly scope: ScopeId;
    readonly task: TaskId;
    readonly sessions: readonly SessionKey[];
    readonly fact: Fact;
    readonly at: Instant;
}
export interface RecapWritten {
    readonly kind: 'recap-written';
    readonly scope: ScopeId;
    readonly turns: number;
    readonly boundary: boolean;
    readonly cause?: RecapCause;
}
export type LedgerEvent = TurnRecorded | AccomplishmentEstablished | RecapWritten;
