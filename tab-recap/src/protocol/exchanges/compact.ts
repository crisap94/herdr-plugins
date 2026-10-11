import { INTERRUPTED_REASON } from '../exchange.ts';
import type { Exchange } from '../exchange.ts';
import { exchangeName, exchangeVersion } from '../primitives.ts';
import { must } from '../result.ts';

export const COMPACT_STAGES = { queued: 'queued', running: 'running', done: 'done' } as const;

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

export const COMPACT_EVENTS = {
    queued: 'compact-queued',
    running: 'compact-running',
    done: 'compact-done',
    failed: 'compact-failed',
} as const;

export const compact = {
    name: must(exchangeName('compact')),
    version: must(exchangeVersion(1)),
    requestPrefix: 'compact-req-',
    request: [
        { kind: 'id', grammar: 'legacy-length' },
        { kind: 'rest', name: 'note', optional: true, maxChars: null },
    ],
    answerStages: Object.values(COMPACT_STAGES),
    failureReasons: Object.values(COMPACT_FAILURES),
    events: Object.values(COMPACT_EVENTS),
    optIn: 'TAB_RECAP_HERDR_EVENTS',
    timing: {},
    truncatesAnswer: true,
} as const satisfies Exchange;
