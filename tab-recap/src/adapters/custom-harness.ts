import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import type { Harness, HarnessCall, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { run, scrubbedEnv } from './process.ts';

/** Splits a command line into argv — whitespace, single and double quotes — with no shell involved. */
export function splitArgv(line: string): string[] {
    const argv: string[] = [];
    let word = '';
    let quote: string | null = null;
    let started = false;
    for (const char of line) {
        if (quote !== null) {
            if (char === quote) { quote = null; } else { word += char; }
        } else if (char === '"' || char === "'") {
            quote = char;
            started = true;
        } else if (/\s/.test(char)) {
            if (started) { argv.push(word); }
            word = '';
            started = false;
        } else {
            word += char;
            started = true;
        }
    }
    return started ? [...argv, word] : argv;
}

/**
 * `TAB_RECAP_CUSTOM_CMD`: any program that reads the prompt on stdin and prints the answer on
 * stdout. Whether it is tool-less and ephemeral is the operator's to guarantee. It has no model or effort of its own.
 */
export class CustomHarness implements Harness {
    readonly id = 'custom';
    readonly limit = null;
    private readonly argv: readonly string[];
    private readonly workDir: string;
    private readonly timeoutMs: number;

    constructor(command: string, workDir: string, timeoutMs: number) {
        this.argv = splitArgv(command);
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
    }

    label(): string {
        return `custom/${basename(this.argv[0] ?? '?')}`;
    }

    async run(call: HarnessCall): Promise<Ran> {
        const [program, ...args] = this.argv;
        if (program === undefined) {
            return unknown({ why: 'not-found', what: 'TAB_RECAP_CUSTOM_CMD (it is empty)' });
        }
        mkdirSync(this.workDir, { recursive: true });
        const input = `${call.input}\n\n${call.instructions}`;
        const ran = await run(program, args, { input, timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv() });
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        if (ran.code !== 0 || ran.stdout.trim() === '') {
            return unknown({ why: 'failed', code: ran.code, detail: (ran.stderr || ran.stdout).trim().slice(0, 300) });
        }
        return { kind: 'ran', text: ran.stdout, costUsd: 0 };
    }
}
