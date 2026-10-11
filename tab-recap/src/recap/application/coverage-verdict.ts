import type { Messages } from '#src/i18n/index.ts';
import { unreachable } from '#src/recap/domain/autocompact.ts';
import type { Checked, CoverageFlow } from './compaction-coverage.ts';

export function coverageWhy(outcome: Checked['outcome'], why: string | null, messages: Messages): string | null {
    switch (outcome.kind) {
        case 'passed': return why;
        case 'missed': return messages.compaction.coverageCeiling(outcome.facts.length);
        case 'unchecked': return messages.compaction.coverageUnchecked[outcome.reason];
        default: return unreachable(outcome);
    }
}

export function coverageLog(outcome: Checked['outcome'], messages: Messages): string | null {
    switch (outcome.kind) {
        case 'passed': return null;
        case 'missed': return messages.compaction.coverageCeiling(outcome.facts.length);
        case 'unchecked': return messages.compaction.coverageUnchecked[outcome.reason];
        default: return unreachable(outcome);
    }
}

export function blockedByCoverage(checked: Checked, flow: CoverageFlow): boolean {
    if (flow.atCeiling) return false;
    switch (checked.outcome.kind) {
        case 'passed': return false;
        case 'missed': return !flow.appends;
        case 'unchecked': return checked.outcome.reason === 'decider-cannot-answer' ? !flow.appends : true;
        default: return unreachable(checked.outcome);
    }
}
