import type { Observed } from '#src/recap/domain/compaction.ts';
import { obj, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';
import { count } from './context-values.ts';

export function opencodeObserved(data: Row): Observed | null {
    const tokens = obj(data['tokens']);
    const cache = obj(tokens['cache']);
    const total = count(tokens['input']) + count(cache['read']) + count(cache['write']);
    const [provider, model] = [str(data['providerID']), str(data['modelID'])];
    return data['role'] !== 'assistant' || total === 0 ? null : { tokens: total, peak: total, window: null, model: provider === null || model === null ? model : `${provider}/${model}` };
}
