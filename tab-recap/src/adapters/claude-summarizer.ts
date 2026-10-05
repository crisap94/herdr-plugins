import { mkdirSync } from 'node:fs';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { instructions, message, unfenced } from './recap-prompt.ts';
import { run, scrubbedEnv } from './run.ts';

export function resultOf(stdout: string): { text: string; cost: number } | null {
    try {
        const parsed: unknown = JSON.parse(stdout);
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }
        const fields = parsed as Readonly<Record<string, unknown>>;
        const text = fields['result'];
        const cost = fields['total_cost_usd'];
        return typeof text === 'string' ? { text, cost: typeof cost === 'number' ? cost : 0 } : null;
    } catch {
        return null;
    }
}

export function claudeArgs(model: string, request: Pick<RecapRequest, 'language' | 'previousLanguage'>): string[] {
    return [
        '-p', '--model', model === '' ? 'haiku' : model, '--no-session-persistence', '--tools', '', '--setting-sources', '',
        '--strict-mcp-config', '--output-format', 'json', '--system-prompt', instructions(request),
    ];
}

/**
 * Headless Claude Code on the operator's subscription (`--bare` would need an API key).
 * No tools, no settings (so no hooks), no MCP, and no transcript of its own.
 */
export class ClaudeSummarizer implements Summarizer {
    readonly backend: string;
    private readonly model: string;
    private readonly workDir: string;
    private readonly timeoutMs: number;

    constructor(model: string, workDir: string, timeoutMs: number) {
        this.model = model === '' ? 'haiku' : model;
        this.backend = `claude/${this.model}`;
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
    }

    async write(request: RecapRequest): Promise<Written> {
        mkdirSync(this.workDir, { recursive: true });
        const args = claudeArgs(this.model, request);
        const ran = await run('claude', args, { input: message(request), timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv() });
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        const result = resultOf(ran.stdout);
        if (ran.code !== 0 || result === null) {
            return unknown({ why: 'failed', code: ran.code, detail: (ran.stderr || ran.stdout).trim().slice(0, 300) });
        }
        return { kind: 'written', text: unfenced(result.text), costUsd: result.cost };
    }
}
