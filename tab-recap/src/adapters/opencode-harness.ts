import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { levelOf } from '#src/recap/domain/effort.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { obj, parse, str } from './jsonl.ts';
import { run, scrubbedEnv } from './process.ts';
import type { Runner } from './process.ts';

/** No tool, no permission: measured, the request shrinks from ~9k to <1k tokens and no tool event appears. */
/** how long after a killed run opencode gets to finish writing its session before we look once more */
const RELIST_MS = 3000;

const TOOLLESS = JSON.stringify({ tools: { '*': false }, permission: { '*': 'deny' } });

export function opencodeArgs(model: string, title: string, effort: Effort = 'default'): string[] {
    const level = levelOf(effort, 'minimal');
    return ['run', '--pure', '--format', 'json', '--title', title, ...(model === '' ? [] : ['-m', model]), ...(level === null ? [] : ['--variant', level])];
}

/** The ids of the sessions called `title` in `opencode session list --format json`. */
export function sessionsTitled(json: string, title: string): string[] {
    try {
        const rows: unknown = JSON.parse(json);
        return Array.isArray(rows) ? rows.flatMap((row: unknown) => (obj(row)['title'] === title ? (str(obj(row)['id']) ?? []) : [])) : [];
    } catch {
        return [];
    }
}

export interface OpencodeOutput {
    readonly text: string;
    readonly cost: number;
    readonly session: string | null;
}

/** `--format json` is one event per line: the answer is the `text` parts, the cost the `step_finish` parts. */
export function opencodeOutput(stdout: string): OpencodeOutput {
    let text = '';
    let cost = 0;
    let session: string | null = null;
    for (const line of stdout.split('\n')) {
        const event = parse(line);
        if (event === null) {
            continue;
        }
        session = str(event['sessionID']) ?? session;
        const part = obj(event['part']);
        if (event['type'] === 'text' && typeof part['text'] === 'string') {
            text += part['text'];
        }
        if (event['type'] === 'step_finish' && typeof part['cost'] === 'number') {
            cost += part['cost'];
        }
    }
    return { text, cost, session };
}

/**
 * `opencode run`, prompt on stdin, tools and permissions denied, plugins off. opencode has no
 * ephemeral flag, so the session it stored is deleted once the answer is read — found by the id in
 * the output or, when the run died before printing one, by its unique title.
 */
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
        const listed = await this.runner('opencode', ['session', 'list', '--format', 'json'], { input: '', timeoutMs: 30_000, cwd: this.workDir, env });
        return sessionsTitled(listed.stdout, title);
    }

    private async remove(ids: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
        for (const id of ids) {
            await this.runner('opencode', ['session', 'delete', id], { input: '', timeoutMs: 30_000, cwd: this.workDir, env });
        }
    }

    /**
     * The session is deleted by the id the run printed. A run killed before it printed one is found by its
     * title — and, because opencode may still be writing the session as it dies, looked for once more after a pause.
     */
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
        const env = { ...scrubbedEnv(), OPENCODE_CONFIG_CONTENT: TOOLLESS };
        const input = `${call.input}\n\n${call.instructions}`;
        const title = `tab-recap-${process.pid}-${Date.now()}`;
        const ran = await this.runner('opencode', opencodeArgs(settings.model, title, settings.effort), { input, timeoutMs: this.timeoutMs, cwd: this.workDir, env });
        const output = opencodeOutput(ran.stdout);
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
