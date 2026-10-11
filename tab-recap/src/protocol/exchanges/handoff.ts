import { INTERRUPTED_REASON } from '../exchange.ts';
import type { Exchange } from '../exchange.ts';
import { exchangeName, exchangeVersion } from '../primitives.ts';
import { must } from '../result.ts';

export const HANDOFF_STAGES = { queued: 'queued', running: 'running', delivered: 'delivered' } as const;

export const HANDOFF_REFUSALS = [
    'not-offered',
    'bad-request',
    'not-a-lane',
    'target-elsewhere',
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

export const HANDOFF_UNSUPPORTED = ['no-plan'] as const;

export const HANDOFF_FAILURES = ['transport', 'unconfirmed', 'internal-error', 'source-unreadable', 'expired', INTERRUPTED_REASON] as const;

export const HANDOFF_EVENTS = {
    queued: 'handoff-queued',
    running: 'handoff-running',
    delivered: 'handoff-delivered',
    failed: 'handoff-failed',
} as const;

export const handoff = {
    name: must(exchangeName('handoff')),
    version: must(exchangeVersion(1)),
    requestPrefix: 'handoff-req-',
    request: [
        { kind: 'id', grammar: 'token-safe' },
        { kind: 'word', name: 'workspace', optional: false, shape: 'pane-part' },
        { kind: 'word', name: 'pane', optional: false, shape: 'pane-part' },
        { kind: 'flag', name: 'refresh', text: 'refresh' },
    ],
    answerStages: Object.values(HANDOFF_STAGES),
    refusalReasons: HANDOFF_REFUSALS,
    unsupportedReasons: HANDOFF_UNSUPPORTED,
    failureReasons: HANDOFF_FAILURES,
    events: Object.values(HANDOFF_EVENTS),
    optIn: 'TAB_RECAP_HANDOFF_REQUESTS',
    timing: { 'deadline-ms': 200_000 },
    truncatesAnswer: false,
} as const satisfies Exchange;
