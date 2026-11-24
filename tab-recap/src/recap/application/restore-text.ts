import { must } from '@stateforge-labs/session-ledger';
import type { Fact } from '@stateforge-labs/session-ledger';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import type { RestoreContent } from '#src/recap/domain/restore-content.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import type { LastRun } from '@stateforge-labs/session-ledger';
import { fitRestore } from '#src/recap/render/restore-markdown.ts';
import { groupedFactsOf } from './handoff-groups.ts';
import { HANDOFF_BUDGET_BYTES } from './handoff-limits.ts';
import { countOf } from '@stateforge-labs/session-ledger';

export interface RestoreFacts {
    readonly at: Instant;
    readonly lastRun: LastRun | null;
    readonly open: readonly Fact[];
    readonly closed: readonly Fact[];
}

export function restoreContentOf(facts: RestoreFacts): RestoreContent {
    if (facts.lastRun === null) {
        return { kind: 'empty' };
    }
    const grouped = groupedFactsOf(facts);
    if (grouped.kind === 'refused') {
        return { kind: 'empty' };
    }
    return { kind: 'content', lastRunAt: instant(facts.lastRun.at), groups: grouped.groups, withheld: grouped.withheld };
}

export function restoreTextOf(facts: RestoreFacts): Text {
    const content = restoreContentOf(facts);
    const fitted = content.kind === 'content' ? fitRestore(content, byteBudgetOf(countOf(HANDOFF_BUDGET_BYTES))) : null;
    return must(parseText(fitted?.kind === 'text' ? fitted.text : ''));
}
