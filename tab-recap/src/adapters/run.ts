// Runs one external program with stdin, a timeout and a scrubbed environment.
import { spawn } from 'node:child_process';

export interface RunResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
}

export interface RunOptions {
    readonly input: string;
    readonly timeoutMs: number;
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    /** how long after SIGTERM the process group is SIGKILLed (default 5 s) */
    readonly killAfterMs?: number;
}

/**
 * A summarizer must not look like an agent to herdr: herdr's Claude hook registers any
 * claude that starts with HERDR_PANE_ID set as the agent of that pane.
 */
export function scrubbedEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('HERDR_') && !key.startsWith('TAB_RECAP_') && key !== 'CLAUDECODE' && key !== 'CLAUDE_CODE_ENTRYPOINT') {
            env[key] = value;
        }
    }
    return env;
}

/** After SIGTERM, how long a program gets before the whole process group is SIGKILLed. */
export const KILL_AFTER_MS = 5000;
/** After the program exits, how long a grandchild holding its pipes open may keep us waiting. */
const EXIT_GRACE_MS = 1000;
const KILLED = 137;

export type Runner = typeof run;

/**
 * The program runs in its own process group, so a timeout takes its children with it: SIGTERM to the
 * group, SIGKILL after `killAfterMs`. The promise always resolves: a grandchild that keeps stdout
 * open can no longer hold it forever.
 */
export function run(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
        const child = spawn(command, [...args], { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const killGroup = (signal: NodeJS.Signals): void => {
            const pid = child.pid;
            try {
                if (pid === undefined) {
                    child.kill(signal);
                } else {
                    process.kill(-pid, signal);
                }
            } catch {
                child.kill(signal);
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
            killGroup('SIGTERM');
            timers.push(setTimeout(() => { killGroup('SIGKILL'); finish(KILLED); }, options.killAfterMs ?? KILL_AFTER_MS));
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
