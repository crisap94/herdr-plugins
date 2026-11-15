import { COMPACT_FAILURES } from '../reasons.ts';
import type { Exchange } from '../exchange.ts';
import { parseAnswerStage, parseEventName, parseExchangeName, parseExchangeVersion, parseFieldName, parseOptIn, parseRequestPrefix } from '../primitives.ts';
import { must } from '../result.ts';

export const COMPACT_STAGES = { queued: 'queued', running: 'running', done: 'done' } as const;

export { COMPACT_FAILURES } from '../reasons.ts';
export type { CompactFailure } from '../reasons.ts';

export const COMPACT_EVENTS = {
    queued: 'compact-queued',
    running: 'compact-running',
    done: 'compact-done',
    failed: 'compact-failed',
} as const;

export const compact = {
    name: must(parseExchangeName('compact')),
    version: must(parseExchangeVersion(1)),
    requestPrefix: must(parseRequestPrefix('compact-req-')),
    request: [
        { kind: 'id', grammar: 'legacy-length' },
        { kind: 'rest', name: must(parseFieldName('note')), presence: 'optional', maxChars: null },
    ],
    answerStages: Object.values(COMPACT_STAGES).map((stage) => must(parseAnswerStage(stage))),
    failureReasons: Object.values(COMPACT_FAILURES),
    events: Object.values(COMPACT_EVENTS).map((event) => must(parseEventName(event))),
    optIn: must(parseOptIn('TAB_RECAP_HERDR_EVENTS')),
    timing: {},
    answerFit: 'truncate',
} as const satisfies Exchange;
