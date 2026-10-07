import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { run, scrubbedEnv } from './process.ts';
import type { Runner } from './process.ts';

/**
 * Features a recap never uses, each probe-verified on codex 0.157.1 (an unknown one is an error) and measured:
 * together they cut the request by about 6%. `apps`, `image_generation`, `sleep_tool` and `goals` are
 * accepted too but make the request ~2.5x bigger, so they stay on.
 */
export const UNUSED_FEATURES: readonly string[] = ['multi_agent', 'plugins', 'browser_use', 'computer_use', 'skill_search', 'tool_suggest', 'hooks'];

export function codexArgs(model: string, out: string, effort: Effort = 'default'): string[] {
    const level = levelOf(effort, 'low');
    return [
        'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only',
        '--color', 'never', ...(model === '' ? [] : ['-m', model]),
        ...(level === null ? [] : ['-c', `model_reasoning_effort=${level}`]),
        ...UNUSED_FEATURES.flatMap((feature) => ['--disable', feature]), '-o', out, '-',
    ];
}

/** `codex exec`, ephemeral (no rollout written), read-only sandbox, user config ignored; the data first, then the instructions, on stdin. */
export class CodexHarness implements Harness {
    readonly id = 'codex';
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
        return settings.model === '' ? 'codex' : `codex/${settings.model}`;
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        mkdirSync(this.workDir, { recursive: true });
        const out = join(this.workDir, `codex-${process.pid}-${Date.now()}.md`);
        const input = `${call.input}\n\n${call.instructions}`;
        const ran = await this.runner('codex', codexArgs(settings.model, out, settings.effort), { input, timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv() });
        let text = '';
        try { text = readFileSync(out, 'utf8'); } catch { /* codex wrote nothing */ }
        rmSync(out, { force: true });
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        if (ran.code !== 0 || text.trim() === '') {
            return unknown({ why: 'failed', code: ran.code, detail: ran.stderr.trim().slice(-300) });
        }
        return { kind: 'ran', text, costUsd: 0 };
    }
}
