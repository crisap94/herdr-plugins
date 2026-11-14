import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Called, FailureKind } from './types.ts';

export const STATE_ROOT = join(homedir(), '.local', 'state', 'tab-recap-evals', 'suite');

export function emptyCwd(): string {
    const dir = join(STATE_ROOT, '.empty-cwd');
    mkdirSync(dir, { recursive: true });
    return dir;
}

export function childEnv(drop: readonly string[]): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && !drop.includes(key)) {
            env[key] = value;
        }
    }
    return env;
}

export function failureOf(error: unknown): { readonly kind: FailureKind; readonly detail: string } {
    const name = error instanceof Error ? error.name : '';
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    if (name === 'AbortError' || /aborted/i.test(detail)) return { kind: 'timeout', detail };
    if (/rate.?limit|\b429\b|usage limit|too many requests|overloaded/i.test(detail)) return { kind: 'rate_limit', detail };
    if (/model|\b400\b|unsupported value/i.test(detail)) return { kind: 'config', detail };
    return { kind: 'failed', detail };
}

export function failedCall(kind: FailureKind, detail: string, latency: number): Called {
    return { text: null, structured: undefined, failure_kind: kind, failure_detail: detail, input_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cost_usd: null, cost_basis: null, latency_ms: latency, models: [], anomalies: [] };
}
