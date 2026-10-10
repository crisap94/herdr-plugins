import type { Exchange } from '../exchange.ts';
import { exchangeName, exchangeVersion } from '../primitives.ts';
import { must } from '../result.ts';

export const COMPACT_STAGES = { queued: 'queued', running: 'running', done: 'done' } as const;

export const COMPACT_FAILURES = {
    badId: 'bad-id',
    notALane: 'not-a-lane',
    interrupted: 'interrupted',
    noTarget: 'no-target',
    error: 'error',
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
    events: ['compact-queued', 'compact-running', 'compact-done', 'compact-failed'],
    optIn: 'TAB_RECAP_HERDR_EVENTS',
    timing: {},
    truncatesAnswer: true,
} as const satisfies Exchange;
