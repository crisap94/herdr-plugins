import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { obj, parse, str } from './jsonl.ts';
import { ARGV_BYTES } from './recap-prompt.ts';
import { run, scrubbedEnv } from './run.ts';
import type { Runner } from './run.ts';

/**
 * `--safe-mode` drops user config, rules, memory, plugins and MCP; `-t clarify` leaves the one
 * toolset that cannot touch files, a shell or the network (measured: `-t ''` means "all tools").
 */
export function hermesArgs(model: string, prompt: string, usage: string, effort: Effort = 'default'): string[] {
    const level = levelOf(effort, 'low');
    return ['-z', prompt, '--safe-mode', '-t', 'clarify', ...(model === '' ? [] : ['-m', model]), ...(level === null ? [] : ['--reasoning', level]), '--usage-file', usage];
}

export function hermesUsage(json: string): { cost: number; session: string | null } {
    const report = parse(json) ?? {};
    const total = obj(report['total_including_auxiliary'])['estimated_cost_usd'];
    return { cost: typeof total === 'number' ? total : 0, session: str(report['session_id']) };
}

/**
 * `hermes -z`: it reads no stdin, so the prompt is an argument (the caller keeps it within `limit`).
 * hermes keeps every run as a session, so the one this run made is deleted once it is read.
 */
export class HermesHarness implements Harness {
    readonly id = 'hermes';
    readonly limit = ARGV_BYTES;
    private readonly workDir: string;
    private readonly timeoutMs: number;
    private readonly runner: Runner;

    constructor(workDir: string, timeoutMs: number, runner: Runner = run) {
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
        this.runner = runner;
    }

    label(settings: HarnessSettings): string {
        return settings.model === '' ? 'hermes' : `hermes/${settings.model}`;
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        mkdirSync(this.workDir, { recursive: true });
        const usage = join(this.workDir, `hermes-${process.pid}-${Date.now()}.json`);
        const opts = { input: '', timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv() };
        const ran = await this.runner('hermes', hermesArgs(settings.model, `${call.input}\n\n${call.instructions}`, usage, settings.effort), opts);
        let report = { cost: 0, session: null as string | null };
        try { report = hermesUsage(readFileSync(usage, 'utf8')); } catch { /* hermes wrote no report */ }
        rmSync(usage, { force: true });
        if (report.session !== null) {
            await this.runner('hermes', ['sessions', 'delete', '--yes', report.session], { ...opts, timeoutMs: 30_000 });
        }
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        if (ran.code !== 0 || ran.stdout.trim() === '') {
            return unknown({ why: 'failed', code: ran.code, detail: (ran.stderr || ran.stdout).trim().slice(0, 300) });
        }
        return { kind: 'ran', text: ran.stdout, costUsd: report.cost };
    }
}
