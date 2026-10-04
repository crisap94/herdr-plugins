import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { instructions, message, unfenced } from './recap-prompt.ts';
import { run, scrubbedEnv } from './run.ts';

export function codexArgs(model: string, out: string): string[] {
    return [
        'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only',
        '--color', 'never', ...(model === '' ? [] : ['-m', model]), '-o', out, '-',
    ];
}

/** `codex exec`, ephemeral (no rollout written), read-only sandbox, user config ignored. */
export class CodexSummarizer implements Summarizer {
    readonly backend: string;
    private readonly model: string;
    private readonly workDir: string;
    private readonly timeoutMs: number;

    constructor(model: string, workDir: string, timeoutMs: number) {
        this.model = model;
        this.backend = model === '' ? 'codex' : `codex/${model}`;
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
    }

    async write(request: RecapRequest): Promise<Written> {
        mkdirSync(this.workDir, { recursive: true });
        const out = join(this.workDir, `codex-${process.pid}-${Date.now()}.md`);
        const args = codexArgs(this.model, out);
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
        return { kind: 'written', markdown: unfenced(text), costUsd: 0 };
    }
}
