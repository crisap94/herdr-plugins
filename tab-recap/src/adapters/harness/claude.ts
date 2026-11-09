import { mkdirSync } from 'node:fs';
import { harnessBinary } from '@stateforge-labs/harness-adapters';
import { claudeHeadlessArgs, parseClaudeResult } from '@stateforge-labs/harness-adapters/claude';
import type { Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { run, scrubbedEnv } from '../os/process/control.ts';
import type { Runner } from '../os/process/control.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';

export function resultOf(stdout: string): { text: string; cost: number } | null {
    const result = parseClaudeResult(stdout);
    return result === null ? null : { text: result.text, cost: result.costUsd };
}

export function claudeArgs(model: string, instructions: string, effort: Effort = 'default'): string[] {
    return claudeHeadlessArgs({ model: model === '' ? 'haiku' : model, systemPrompt: instructions, effort: levelOf(effort, 'low') });
}

export class ClaudeHarness implements Harness {
    readonly id = 'claude';
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
        return `claude/${settings.model === '' ? 'haiku' : settings.model}`;
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        mkdirSync(this.workDir, { recursive: true });
        const ran = await this.runner(harnessBinary('claude'), claudeArgs(settings.model, call.instructions, settings.effort), { input: call.input, timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv(this.jobTag) });
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
