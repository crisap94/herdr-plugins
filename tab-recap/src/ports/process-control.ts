// Running an external program and ending it with everything it started. One adapter per OS family; the harnesses and
// git take a `Runner` and never learn which one they got.
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
    /** how long after the polite end the whole tree is killed for good (default 5 s) */
    readonly killAfterMs?: number;
}

export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

export interface ProcessControl {
    /** The program runs with stdin and a timeout; a timeout takes its children with it. The promise always resolves. */
    readonly run: Runner;
    /** Ends `pid` and every process it started: politely first (`force` false), for good when `force` is true. */
    readonly killTree: (pid: number, force: boolean) => void;
}
