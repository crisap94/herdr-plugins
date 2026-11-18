import { err, ok, type Result } from '#src/protocol/result.ts';
import type { Judged } from '#src/recap/application/ops-gating.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Reconciliation } from '#src/recap/domain/reconciliation.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type RepairMode = 'off' | 'once';

export function parseRepairMode(input: unknown): Result<RepairMode, ParseFailure> {
    if (input === undefined) {
        return ok('off');
    }
    if (typeof input !== 'string') {
        return err({ kind: 'out-of-range' });
    }
    const mode = input.trim().toLowerCase();
    if (mode === '' || mode === 'off') {
        return ok('off');
    }
    return mode === 'once' ? ok('once') : err({ kind: 'out-of-range' });
}

export function repairModeOr(read: Result<RepairMode, ParseFailure>): RepairMode {
    return read.kind === 'ok' ? read.value : 'off';
}

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
