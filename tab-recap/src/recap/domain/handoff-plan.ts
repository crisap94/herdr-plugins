import type { HandoffOutcome } from './handoff-outcome.ts';
import type { Count } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Duration } from '@stateforge-labs/session-ledger';

export interface SettleEvidence {
    readonly trials: Count;
    readonly source: Text;
}

export type HandoffEvidence = 'transcript' | 'status' | 'either';

export type LocatedBy = 'session' | 'directory';

export interface SettleTime {
    readonly after: Duration;
    readonly evidence: SettleEvidence;
}

export interface HandoffPlan {
    readonly delivery: 'prompt';
    readonly evidence: HandoffEvidence;
    readonly retry: 'none';
    readonly settle: SettleTime;
    readonly locatedBy: LocatedBy;
}

export type HandoffPlanResult = { readonly kind: 'supported'; readonly plan: HandoffPlan } | Extract<HandoffOutcome, { readonly kind: 'unsupported' }>;
