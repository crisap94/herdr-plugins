import { createHash } from 'node:crypto';
import type { Adapter, Called } from './types.ts';

export function stubCalled(text: string): Called {
    return { text, structured: undefined, failure_kind: null, failure_detail: null, input_tokens: 100, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: Math.ceil(text.length / 4), reasoning_tokens: 0, cost_usd: 0, cost_basis: 'stub', latency_ms: 1, models: ['stub'], anomalies: [] };
}

export function stubJudge(criteria: readonly string[]): Adapter {
    return async (call) => {
        const answer = /<answer>\n([\s\S]*?)\n<\/answer>/.exec(call.user)?.[1] ?? '';
        const evidence = answer.trim().slice(0, 24);
        const verdicts = criteria.map((criterion) => {
            const fails = (createHash('sha256').update(`${criterion}|${answer}`).digest()[0] ?? 0) % 4 === 0;
            return { criterion, verdict: fails || evidence === '' ? 'fail' : 'pass', evidence: fails ? '' : evidence };
        });
        const structured = { verdicts };
        return { ...stubCalled(JSON.stringify(structured)), structured };
    };
}
