import type { HandoffOutcome } from './handoff-outcome.ts';
import type { Duration } from './time.ts';

export type HandoffEvidence = 'transcript' | 'status' | 'either';

export type LocatedBy = 'session' | 'directory';

export interface SettleEvidence {
    readonly trials: number;
    readonly source: string;
}

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
