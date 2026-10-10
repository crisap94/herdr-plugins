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
    readonly killAfterMs?: number;
}

export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

export interface ProcessControl {
    readonly run: Runner;
    readonly killTree: (pid: number, force: boolean) => void;
}
