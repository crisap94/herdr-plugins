import type { spawn } from 'node:child_process';
import type { ProcessControl, RunOptions, RunResult } from '#src/ports/process-control.ts';

export type Spawner = typeof spawn;

export interface Flavour {
    readonly spawner: Spawner;
    readonly detached: boolean;
    readonly windowsHide: boolean;
    readonly killTree: ProcessControl['killTree'];
}

export const KILL_AFTER_MS = 5000;
const EXIT_GRACE_MS = 1000;
const KILLED = 137;

export function runIn(flavour: Flavour, command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
        const child = flavour.spawner(command, [...args], { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], detached: flavour.detached, windowsHide: flavour.windowsHide });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const end = (force: boolean): void => {
            const pid = child.pid;
            try {
                if (pid === undefined) {
                    child.kill(force ? 'SIGKILL' : 'SIGTERM');
                } else {
                    flavour.killTree(pid, force);
                }
            } catch {
                child.kill(force ? 'SIGKILL' : 'SIGTERM');
            }
        };
        const finish = (code: number, extra = ''): void => {
            if (settled) {
                return;
            }
            settled = true;
            timers.forEach(clearTimeout);
            child.stdout.destroy();
            child.stderr.destroy();
            resolve({ code, stdout, stderr: `${stderr}${extra}`, timedOut });
        };
        timers.push(setTimeout(() => {
            timedOut = true;
            end(false);
            timers.push(setTimeout(() => { end(true); finish(KILLED); }, options.killAfterMs ?? KILL_AFTER_MS));
        }, options.timeoutMs));
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
        child.on('error', (error) => { finish(127, error.message); });
        child.on('exit', (code) => { timers.push(setTimeout(() => { finish(code ?? 1); }, EXIT_GRACE_MS)); });
        child.on('close', (code) => { finish(code ?? 1); });
        child.stdin.on('error', () => undefined);
        child.stdin.end(options.input);
    });
}
