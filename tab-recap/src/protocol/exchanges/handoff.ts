import { HANDOFF_FAILURES, HANDOFF_REFUSALS, HANDOFF_UNSUPPORTED } from '../reasons.ts';
import type { Exchange } from '../exchange.ts';
import { parseAnswerStage, parseEventName, parseExchangeName, parseExchangeVersion, parseFieldName, parseFlagText, parseOptIn, parseRequestPrefix, parseTimingMs, parseTimingName } from '../primitives.ts';
import { must } from '@stateforge-labs/session-ledger';

export const HANDOFF_STAGES = { queued: 'queued', running: 'running', delivered: 'delivered' } as const;

export { HANDOFF_FAILURES, HANDOFF_REFUSALS, HANDOFF_UNSUPPORTED } from '../reasons.ts';

export const HANDOFF_EVENTS = {
    queued: 'handoff-queued',
    running: 'handoff-running',
    delivered: 'handoff-delivered',
    failed: 'handoff-failed',
} as const;

export const handoff = {
    name: must(parseExchangeName('handoff')),
    version: must(parseExchangeVersion(1)),
    requestPrefix: must(parseRequestPrefix('handoff-req-')),
    request: [
        { kind: 'id', grammar: 'token-safe' },
        { kind: 'word', name: must(parseFieldName('workspace')), presence: 'required', shape: 'pane-part' },
        { kind: 'word', name: must(parseFieldName('pane')), presence: 'required', shape: 'pane-part' },
        { kind: 'flag', name: must(parseFieldName('refresh')), text: must(parseFlagText('refresh')) },
    ],
    answerStages: Object.values(HANDOFF_STAGES).map((stage) => must(parseAnswerStage(stage))),
    refusalReasons: HANDOFF_REFUSALS,
    unsupportedReasons: HANDOFF_UNSUPPORTED,
    failureReasons: HANDOFF_FAILURES,
    events: Object.values(HANDOFF_EVENTS).map((event) => must(parseEventName(event))),
    optIn: must(parseOptIn('TAB_RECAP_HANDOFF_REQUESTS')),
    timing: { [must(parseTimingName('deadline-ms'))]: must(parseTimingMs(200_000)) },
    answerFit: 'whole',
} as const satisfies Exchange;
