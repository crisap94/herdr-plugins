import { mkdirSync } from 'node:fs';
import type { Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { run, scrubbedEnv } from './run.ts';
import type { Runner } from './run.ts';

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

export function claudeArgs(model: string, instructions: string, effort: Effort = 'default'): string[] {
    const level = levelOf(effort, 'low');
    return [
        '-p', '--model', model === '' ? 'haiku' : model, '--no-session-persistence', '--tools', '', '--setting-sources', '',
        '--strict-mcp-config', '--output-format', 'json', '--system-prompt', instructions,
        ...(level === null ? [] : ['--effort', level]),
    ];
}

/**
 * Headless Claude Code on the operator's subscription (`--bare` would need an API key).
 * No tools, no settings (so no hooks), no MCP, and no transcript of its own.
 */
export class ClaudeHarness implements Harness {
    readonly id = 'claude';
    readonly limit = null;
    private readonly workDir: string;
    private readonly timeoutMs: number;
    private readonly runner: Runner;

    constructor(workDir: string, timeoutMs: number, runner: Runner = run) {
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
        this.runner = runner;
    }

    label(settings: HarnessSettings): string {
        return `claude/${settings.model === '' ? 'haiku' : settings.model}`;
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        mkdirSync(this.workDir, { recursive: true });
        const ran = await this.runner('claude', claudeArgs(settings.model, call.instructions, settings.effort), { input: call.input, timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv() });
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        const result = resultOf(ran.stdout);
        if (ran.code !== 0 || result === null) {
            return unknown({ why: 'failed', code: ran.code, detail: (ran.stderr || ran.stdout).trim().slice(0, 300) });
        }
        return { kind: 'ran', text: result.text, costUsd: result.cost };
    }
}
