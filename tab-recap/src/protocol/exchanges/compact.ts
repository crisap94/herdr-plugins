import type { Exchange } from '../exchange.ts';
import type { ExchangeName, ExchangeVersion } from '../primitives.ts';

export const compact = {
    name: 'compact' as ExchangeName,
    version: 1 as ExchangeVersion,
    requestPrefix: 'compact-req-',
    request: [
        { kind: 'id', grammar: 'legacy-length' },
        { kind: 'rest', name: 'note', optional: true, maxChars: null },
    ],
    answerStages: ['queued', 'running', 'done'],
    failureReasons: ['bad-id', 'not-a-lane', 'interrupted', 'no-target', 'error'],
    events: ['compact-queued', 'compact-running', 'compact-done', 'compact-failed'],
    optIn: 'TAB_RECAP_HERDR_EVENTS',
    timing: {},
    truncatesAnswer: true,
} as const satisfies Exchange;
