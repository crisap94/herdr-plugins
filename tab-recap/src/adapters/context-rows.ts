// What the agents' own records say about how full their context is. Pure over lines; the readers read the files.
import type { Observed } from '#src/recap/domain/compaction.ts';
import { obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';

const rowsOf = (lines: readonly string[]): readonly Row[] => lines.map((line) => parse(line)).filter((row): row is Row => row !== null);

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** Claude: the newest assistant row's usage is what the last request sent (input + cache); `preTokens` of a compaction is the most seen before it, and its `postTokens` is the use until a newer usage row. */
export function claudeObserved(lines: readonly string[]): Observed | null {
    let latest: { tokens: number; model: string | null } | null = null;
    let peak = 0;
    for (const row of rowsOf(lines)) {
        const compaction = obj(row['compactMetadata']);
        peak = Math.max(peak, count(compaction['preTokens']));
        if (count(compaction['postTokens']) > 0) latest = { tokens: count(compaction['postTokens']), model: latest?.model ?? null };
        const message = obj(row['message']);
        const usage = obj(message['usage']);
        const model = str(message['model']);
        if (row['type'] === 'assistant' && row['isSidechain'] !== true && model !== '<synthetic>' && Object.keys(usage).length > 0) {
            latest = { tokens: count(usage['input_tokens']) + count(usage['cache_read_input_tokens']) + count(usage['cache_creation_input_tokens']), model };
        }
    }
    return latest === null ? null : { tokens: latest.tokens, peak: Math.max(peak, latest.tokens), window: null, model: latest.model };
}

/** Codex: the newest `token_count` (the last request's total and the model's window) and the model of the newest turn. */
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

/** opencode: an assistant message's `tokens` (input + cache read + cache write) and its `providerID/modelID`. */
export function opencodeObserved(data: Row): Observed | null {
    const tokens = obj(data['tokens']);
    const cache = obj(tokens['cache']);
    const total = count(tokens['input']) + count(cache['read']) + count(cache['write']);
    const [provider, model] = [str(data['providerID']), str(data['modelID'])];
    return data['role'] !== 'assistant' || total === 0 ? null : { tokens: total, peak: total, window: null, model: provider === null || model === null ? model : `${provider}/${model}` };
}
