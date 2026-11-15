import { HANDOFF_FAILURES, HANDOFF_REFUSALS, HANDOFF_UNSUPPORTED } from '../reasons.ts';
import type { Exchange } from '../exchange.ts';
import { parseExchangeName, parseExchangeVersion, parseFieldName, parseFlagText } from '../primitives.ts';
import { must } from '../result.ts';

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
    requestPrefix: 'handoff-req-',
    request: [
        { kind: 'id', grammar: 'token-safe' },
        { kind: 'word', name: must(parseFieldName('workspace')), presence: 'required', shape: 'pane-part' },
        { kind: 'word', name: must(parseFieldName('pane')), presence: 'required', shape: 'pane-part' },
        { kind: 'flag', name: must(parseFieldName('refresh')), text: must(parseFlagText('refresh')) },
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
