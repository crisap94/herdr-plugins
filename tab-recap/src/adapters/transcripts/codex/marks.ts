import type { Mark } from '#src/ports/transcripts.ts';
import { isCompaction, readRollout, tokenCounts } from '@stateforge-labs/harness-adapters/codex';
import type { CodexRow } from '@stateforge-labs/harness-adapters/codex';

const countOf = (row: CodexRow): number | undefined => {
    const last = tokenCounts([row])[0]?.last;
    return typeof last === 'number' && last > 0 ? last : undefined;
};

export function marksOf(rows: readonly CodexRow[]): readonly Mark[] {
    const marks: { mark: Mark; waiting: boolean }[] = [];
    let last: number | undefined;
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

export function codexMarks(lines: readonly string[]): readonly Mark[] {
    return marksOf(readRollout(lines).rows);
}
