import type { Mark } from '#src/ports/transcripts.ts';
import { obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';

const count = (row: Row): number | undefined => {
    const payload = obj(row['payload']);
    const total = obj(obj(payload['info'])['last_token_usage'])['total_tokens'];
    return row['type'] === 'event_msg' && payload['type'] === 'token_count' && typeof total === 'number' && total > 0 ? total : undefined;
};

const timeOf = (row: Row): number | null => {
    const at = Date.parse(str(row['timestamp']) ?? '');
    return Number.isNaN(at) ? null : at;
};

export function codexMarks(lines: readonly string[]): readonly Mark[] {
    const marks: { mark: Mark; waiting: boolean }[] = [];
    let last: number | undefined;
    for (const row of lines.map((line) => parse(line))) {
        if (row === null) {
            continue;
        }
        const counted = count(row);
        if (counted !== undefined) {
            const open = marks.at(-1);
            if (open?.waiting === true) {
                marks[marks.length - 1] = { mark: { ...open.mark, tokensAfter: counted }, waiting: false };
            }
            last = counted;
        } else if (row['type'] === 'compacted') {
            marks.push({ mark: { kind: 'compacted', at: timeOf(row), ...(last === undefined ? {} : { tokensBefore: last }) }, waiting: true });
        }
    }
    return marks.map((entry) => entry.mark);
}
