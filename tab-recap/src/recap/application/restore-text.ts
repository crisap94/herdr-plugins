import { must } from '#src/protocol/result.ts';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import type { RestoreContent } from '#src/recap/domain/restore-content.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { fitRestore } from '#src/recap/render/restore-markdown.ts';
import type { RestoreFacts } from './engine.ts';
import { groupedFactsOf } from './handoff-groups.ts';
import { HANDOFF_BUDGET_BYTES } from './handoff-limits.ts';

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
    const fitted = content.kind === 'content' ? fitRestore(content, byteBudgetOf(HANDOFF_BUDGET_BYTES)) : null;
    return must(parseText(fitted?.kind === 'text' ? fitted.text : ''));
}
