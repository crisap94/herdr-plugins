import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import type { HarnessAsk, HarnessPort, HarnessRun } from '#src/ports/harness.ts';
import { unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { duration, type Milliseconds } from '#src/recap/domain/time.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { run, scrubbedEnv } from '../os/process/control.ts';

export { CustomHarness } from './legacy.ts';

const CUSTOM_ID = must(parseText('custom'));
const FREE = must(parseUsd(0));

export function splitArgv(line: Text): Text[] {
    const argv: Text[] = [];
    let word = '';
    let quote: '"' | "'" | null = null;
    let started = false;
    for (const char of line) {
        if (quote !== null) {
            if (char === quote) { quote = null; } else { word += char; }
        } else if (char === '"' || char === "'") {
            quote = char;
            started = true;
        } else if (/\s/.test(char)) {
            if (started) { argv.push(must(parseText(word))); }
            word = '';
            started = false;
        } else {
            word += char;
            started = true;
        }
    }
    return started ? [...argv, must(parseText(word))] : argv;
}

export class CustomHarnessPort implements HarnessPort {
    readonly id = CUSTOM_ID;
    readonly limit = null;
    private readonly argv: readonly Text[];
    private readonly workDir: FsPath;
    private readonly timeoutMs: Milliseconds;

    constructor(command: Text, workDir: FsPath, timeoutMs: Milliseconds) {
        this.argv = splitArgv(command);
        this.workDir = workDir;
        this.timeoutMs = timeoutMs;
    }

    label(): Text {
        return must(parseText(`custom/${basename(this.argv[0] ?? '?')}`));
    }

    async run(call: HarnessAsk): Promise<HarnessRun> {
        const [program, ...args] = this.argv;
        if (program === undefined) {
            return unknown({ why: 'not-found', what: textOf('TAB_RECAP_CUSTOM_CMD (it is empty)') });
        }
        mkdirSync(this.workDir, { recursive: true });
        const input = `${call.input}\n\n${call.instructions}`;
        const ran = await run(program, args, { input, timeoutMs: this.timeoutMs, cwd: this.workDir, env: scrubbedEnv() });
        if (ran.timedOut) {
            return unknown({ why: 'timeout', after: duration(this.timeoutMs) });
        }
        if (ran.code !== 0 || ran.stdout.trim() === '') {
            return unknown({ why: 'failed', code: exitCodeOf(ran.code), detail: causeOf(must(parseText((ran.stderr || ran.stdout).trim().slice(0, 300)))) });
        }
        return { kind: 'ran', text: must(parseText(ran.stdout)), costUsd: FREE };
    }
}
