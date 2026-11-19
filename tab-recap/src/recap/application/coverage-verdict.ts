import type { Messages } from '#src/i18n/index.ts';
import { must } from '#src/protocol/result.ts';
import { unreachable } from '#src/recap/domain/autocompact.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Checked, CoverageFlow } from './compaction-coverage.ts';

export function coverageWhy(outcome: Checked['outcome'], why: Text | null, messages: Messages): Text | null {
    switch (outcome.kind) {
        case 'passed': return why;
        case 'missed': return must(parseText(messages.compaction.coverageCeiling(outcome.facts.length)));
        case 'unchecked': return must(parseText(messages.compaction.coverageUnchecked[outcome.reason]));
        default: return unreachable(outcome);
    }
}

export function coverageLog(outcome: Checked['outcome'], messages: Messages): Text | null {
    switch (outcome.kind) {
        case 'passed': return null;
        case 'missed': return must(parseText(messages.compaction.coverageCeiling(outcome.facts.length)));
        case 'unchecked': return must(parseText(messages.compaction.coverageUnchecked[outcome.reason]));
        default: return unreachable(outcome);
    }
}

export function blockedByCoverage(checked: Checked, flow: CoverageFlow): Presence {
    if (flow.atCeiling === 'present') return 'absent';
    switch (checked.outcome.kind) {
        case 'passed': return 'absent';
        case 'missed': return flow.appends === 'absent' ? 'present' : 'absent';
        case 'unchecked': return checked.outcome.reason === 'decider-cannot-answer' && flow.appends === 'present' ? 'absent' : 'present';
        default: return unreachable(checked.outcome);
    }
}
