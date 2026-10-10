import type { Observed } from '#src/recap/domain/compaction.ts';
import { obj, str } from './jsonl.ts';
import { count, rowsOf } from './context-values.ts';

export function claudeObserved(lines: readonly string[]): Observed | null {
    let latest: { tokens: number; model: string | null } | null = null as { tokens: number; model: string | null } | null;
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
