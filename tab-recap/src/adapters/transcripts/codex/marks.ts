import type { Mark } from '#src/ports/transcripts.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { isCompaction, readRollout, tokenCounts } from '@stateforge-labs/harness-adapters/codex';
import type { CodexRow } from '@stateforge-labs/harness-adapters/codex';

export { codexMarks } from './legacy.ts';

const countOf = (row: CodexRow): Count | undefined => {
    const last = parseCount(tokenCounts([row])[0]?.last);
    return last.kind === 'ok' && last.value > 0 ? last.value : undefined;
};

export function marksOf(rows: readonly CodexRow[]): readonly Mark[] {
    const marks: { mark: Mark; waiting: boolean }[] = [];
    let last: Count | undefined;
    for (const row of rows) {
        const counted = countOf(row);
        if (counted !== undefined) {
            const open = marks.at(-1);
            if (open?.waiting === true) {
                marks[marks.length - 1] = { mark: { ...open.mark, tokensAfter: counted }, waiting: false };
            }
            last = counted;
        } else if (isCompaction(row)) {
            marks.push({ mark: { kind: 'compacted', at: row.at, ...(last === undefined ? {} : { tokensBefore: last }) }, waiting: true });
        }
    }
    return marks.map((entry) => entry.mark);
}

export function codexMarksOf(lines: readonly Text[]): readonly Mark[] {
    return marksOf(readRollout(lines).rows);
}
