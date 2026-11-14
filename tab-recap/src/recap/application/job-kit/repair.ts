import type { Judged } from '#src/recap/application/ops-gating.ts';
import type { Reconciliation } from '#src/recap/domain/reconciliation.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type RepairMode = 'off' | 'once';

export function reconcileRepair(document: Text, answer: Text, checked: Reconciliation, judged: Judged): Text {
    const lines = [document, '', '<previous-answer>', answer, '</previous-answer>', '', '<refused>'];
    for (const why of checked.refused) {
        lines.push(`- ${why}`);
    }
    for (const finding of judged.refused) {
        lines.push(`- ${finding.gate} ${finding.reason}`);
    }
    lines.push('</refused>', '', 'Your previous answer, in <previous-answer>, had refused operations, listed in <refused>. Answer again with the whole JSON object: keep the operations that were not refused, and fix or leave out each refused one.');
    const built = parseText(lines.join('\n'));
    return built.kind === 'ok' ? built.value : document;
}
