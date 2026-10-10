import type { Observed } from '#src/recap/domain/compaction.ts';
import { obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';

const rowsOf = (lines: readonly string[]): readonly Row[] => lines.map((line) => parse(line)).filter((row): row is Row => row !== null);

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

export function codexObserved(lines: readonly string[]): Observed | null {
    let counted: { tokens: number; window: number | null } | null = null;
    let model: string | null = null;
    for (const row of rowsOf(lines)) {
        const payload: Row = obj(row['payload']);
        if (row['type'] === 'turn_context') {
            model = str(payload['model']) ?? model;
        } else if (row['type'] === 'event_msg' && payload['type'] === 'token_count') {
            const info = obj(payload['info']);
            const used = obj(info['last_token_usage']);
            const tokens = count(used['total_tokens']) || count(obj(info['total_token_usage'])['total_tokens']);
            counted = tokens === 0 ? counted : { tokens, window: count(info['model_context_window']) || null };
        }
    }
    return counted === null ? null : { tokens: counted.tokens, peak: counted.tokens, window: counted.window, model };
}
