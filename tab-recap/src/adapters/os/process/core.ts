import type { spawn } from 'node:child_process';
import type { KillMode, ProcessOptions, ProcessOutcome, ProcessPort } from '#src/ports/process-control.ts';
import { countOf } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { textOf } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type Spawner = typeof spawn;

export interface Flavour {
    readonly spawner: Spawner;
    readonly detached: boolean;
    readonly killTree: ProcessPort['killTree'];
}

export const KILL_AFTER_MS = 5000;
const EXIT_GRACE_MS = 1000;
const KILLED = 137;

export function runIn(flavour: Flavour, command: FsPath, args: readonly Text[], options: ProcessOptions): Promise<ProcessOutcome> {
    return new Promise<ProcessOutcome>((resolve) => {
        const child = flavour.spawner(command, [...args], { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], detached: flavour.detached });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const end = (mode: KillMode): void => {
            const pid = child.pid;
            try {
                if (pid === undefined) {
                    child.kill(mode === 'force' ? 'SIGKILL' : 'SIGTERM');
                } else {
                    flavour.killTree(countOf(pid), mode);
                }
            } catch {
                child.kill(mode === 'force' ? 'SIGKILL' : 'SIGTERM');
            }
        };
        const finish = (code: Count, extra: Text = textOf('')): void => {
            if (settled) {
                return;
            }
            settled = true;
            timers.forEach(clearTimeout);
            child.stdout.destroy();
            child.stderr.destroy();
            resolve({ code, stdout: textOf(stdout), stderr: textOf(`${stderr}${extra}`), ending: timedOut ? 'timed-out' : 'finished' });
        };
        timers.push(setTimeout(() => {
            timedOut = true;
            end('gentle');
            timers.push(setTimeout(() => { end('force'); finish(countOf(KILLED)); }, options.killAfterMs ?? KILL_AFTER_MS));
        }, options.timeoutMs));
        child.stdout.setEncoding('utf8').on('data', (chunk: Text) => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk: Text) => { stderr += chunk; });
        child.on('error', (error) => { finish(countOf(127), textOf(error.message)); });
        child.on('exit', (code) => { timers.push(setTimeout(() => { finish(countOf(code ?? 1)); }, EXIT_GRACE_MS)); });
        child.on('close', (code) => { finish(countOf(code ?? 1)); });
        child.stdin.on('error', () => undefined);
        child.stdin.end(options.input);
    });
}
