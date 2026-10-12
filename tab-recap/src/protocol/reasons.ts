export const INTERRUPTED_REASON = 'interrupted';

export const COMPACT_FAILURES = {
    badId: 'bad-id',
    notALane: 'not-a-lane',
    interrupted: INTERRUPTED_REASON,
    noTarget: 'no-target',
    skipped: 'skipped',
    busy: 'busy',
    laneBusy: 'lane-busy',
    error: 'error',
} as const;

export type CompactFailure = (typeof COMPACT_FAILURES)[keyof typeof COMPACT_FAILURES];

export const HANDOFF_EXCHANGE_REFUSALS = ['not-offered', 'bad-request', 'target-elsewhere'] as const;

export const HANDOFF_FLOW_REFUSALS = [
    'not-a-lane',
    'source-unavailable',
    'task-ambiguous',
    'source-equals-target',
    'status-not-ready',
    'in-flight',
    'lane-busy',
    'typing-lease-busy',
    'content-empty',
    'ledger-empty',
    'too-large',
] as const;

export const HANDOFF_REFUSALS = [...HANDOFF_EXCHANGE_REFUSALS, ...HANDOFF_FLOW_REFUSALS] as const;

export const HANDOFF_UNSUPPORTED = ['no-plan'] as const;

export const HANDOFF_FAILURES = ['transport', 'unconfirmed', 'internal-error', 'source-unreadable', 'expired', INTERRUPTED_REASON] as const;

export type ReasonWord =
    | CompactFailure
    | (typeof HANDOFF_REFUSALS)[number]
    | (typeof HANDOFF_UNSUPPORTED)[number]
    | (typeof HANDOFF_FAILURES)[number];
