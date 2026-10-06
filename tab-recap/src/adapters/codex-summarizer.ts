import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { instructions, message, unfenced } from './recap-prompt.ts';
import { run, scrubbedEnv } from './run.ts';

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

/** `codex exec`, ephemeral (no rollout written), read-only sandbox, user config ignored. */
export class CodexSummarizer implements Summarizer {
    readonly backend: string;
    private readonly model: string;
    private readonly workDir: string;
    private readonly timeoutMs: number;
    private readonly effort: Effort;

    constructor(model: string, workDir: string, timeoutMs: number, effort: Effort) {
        this.effort = effort;
        this.model = model;
        this.backend = model === '' ? 'codex' : `codex/${model}`;
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
    }

    async write(request: RecapRequest): Promise<Written> {
        mkdirSync(this.workDir, { recursive: true });
        const out = join(this.workDir, `codex-${process.pid}-${Date.now()}.md`);
        const args = codexArgs(this.model, out, this.effort);
        const input = `${instructions(request)}\n\n${message(request)}`;
        const ran = await run('codex', args, { input, timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv() });
        let text = '';
        try { text = readFileSync(out, 'utf8'); } catch { /* codex wrote nothing */ }
        rmSync(out, { force: true });
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        if (ran.code !== 0 || text.trim() === '') {
            return unknown({ why: 'failed', code: ran.code, detail: ran.stderr.trim().slice(-300) });
        }
        return { kind: 'written', text: unfenced(text), costUsd: 0 };
    }
}
