import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { harnessBinary } from '@stateforge-labs/harness-adapters';
import {
    opencodeArgs as opencodeRunArgs,
    opencodeHermeticEnv,
    opencodeSessionDeleteArgs,
    opencodeSessionListArgs,
    parseOpencodeStream,
    parseSessionList,
} from '@stateforge-labs/harness-adapters/opencode';
import type { Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { run, scrubbedEnv } from '../os/process/control.ts';
import type { Runner } from '../os/process/control.ts';

const RELIST_MS = 3000;

export function opencodeArgs(model: string, title: string, effort: Effort = 'default'): string[] {
    const level = levelOf(effort, 'minimal');
    const args = opencodeRunArgs({ model, title });
    return [...args.slice(0, 1), '--pure', ...args.slice(1), ...(level === null ? [] : ['--variant', level])];
}

export function sessionsTitled(json: string, title: string): string[] {
    return parseSessionList(json).filter((session) => session.title === title).map((session) => session.id);
}

export const opencodeOutput = parseOpencodeStream;

export class OpencodeHarness implements Harness {
    readonly id = 'opencode';
    readonly limit = null;
    private readonly workDir: string;
    private readonly timeoutMs: number;
    private readonly runner: Runner;
    private readonly relistMs: number;

    constructor(workDir: string, timeoutMs: number, seams: { readonly runner?: Runner; readonly relistMs?: number } = {}) {
        this.runner = seams.runner ?? run;
        this.relistMs = seams.relistMs ?? RELIST_MS;
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
    }

    label(settings: HarnessSettings): string {
        return settings.model === '' ? 'opencode' : `opencode/${settings.model}`;
    }

    private async titled(title: string, env: NodeJS.ProcessEnv): Promise<string[]> {
        const listed = await this.runner(harnessBinary('opencode'), opencodeSessionListArgs(), { input: '', timeoutMs: 30_000, cwd: this.workDir, env });
        return sessionsTitled(listed.stdout, title);
    }

    private async remove(ids: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
        for (const id of ids) {
            await this.runner(harnessBinary('opencode'), opencodeSessionDeleteArgs(id), { input: '', timeoutMs: 30_000, cwd: this.workDir, env });
        }
    }

    private async forget(session: string | null, title: string, env: NodeJS.ProcessEnv): Promise<void> {
        if (session !== null) {
            await this.remove([session], env);
            return;
        }
        await this.remove(await this.titled(title, env), env);
        await sleep(this.relistMs);
        await this.remove(await this.titled(title, env), env);
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        mkdirSync(this.workDir, { recursive: true });
        const env = { ...scrubbedEnv(), ...opencodeHermeticEnv() };
        const input = `${call.input}\n\n${call.instructions}`;
        const title = `tab-recap-${process.pid}-${Date.now()}`;
        const ran = await this.runner(harnessBinary('opencode'), opencodeArgs(settings.model, title, settings.effort), { input, timeoutMs: this.timeoutMs, cwd: this.workDir, env });
        const output = parseOpencodeStream(ran.stdout);
        await this.forget(output.session, title, env);
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        if (ran.code !== 0 || output.text.trim() === '') {
            return unknown({ why: 'failed', code: ran.code, detail: (ran.stderr || ran.stdout).trim().slice(0, 300) });
        }
        return { kind: 'ran', text: output.text, costUsd: output.cost };
    }
}
