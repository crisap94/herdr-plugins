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

export function run(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
        const child = spawn(command, [...args], { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, options.timeoutMs);
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
        child.on('error', (error) => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: error.message, timedOut }); });
        child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr, timedOut }); });
        child.stdin.end(options.input);
    });
}
