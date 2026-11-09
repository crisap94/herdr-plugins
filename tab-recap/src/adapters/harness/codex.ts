import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CODEX_BINARY, codexExec, readLastMessage } from '@stateforge-labs/harness-adapters/codex';
import type { Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { run, scrubbedEnv } from '../os/process/control.ts';
import type { Runner } from '../os/process/control.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';

export const CODEX_PROGRAM: string = CODEX_BINARY;

export function codexArgs(model: string, out: string, effort: Effort = 'default'): string[] {
    return codexExec({ model, effort: levelOf(effort, 'low'), outFile: out }).args;
}

export class CodexHarness implements Harness {
    readonly id = 'codex';
    readonly limit = null;
    private readonly workDir: string;
    private readonly timeoutMs: number;
    private readonly runner: Runner;
    private readonly jobTag: JobTag | undefined;

    constructor(workDir: string, timeoutMs: number, runner: Runner = run, jobTag?: JobTag) {
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
        this.runner = runner;
        this.jobTag = jobTag;
    }

    label(settings: HarnessSettings): string {
        return settings.model === '' ? 'codex' : `codex/${settings.model}`;
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        mkdirSync(this.workDir, { recursive: true });
        const out = join(this.workDir, `codex-${process.pid}-${Date.now()}.md`);
        const input = `${call.input}\n\n${call.instructions}`;
        const ran = await this.runner(CODEX_PROGRAM, codexArgs(settings.model, out, settings.effort), { input, timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv(this.jobTag) });
        const text = readLastMessage(out) ?? '';
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
