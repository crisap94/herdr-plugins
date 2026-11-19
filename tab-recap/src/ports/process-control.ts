import type { Count } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';

export type { ProcessControl, RunOptions, RunResult, Runner } from './legacy.ts';

export type RunEnding = 'finished' | 'timed-out';

export type KillMode = 'gentle' | 'force';

export interface ProcessOutcome {
    readonly code: Count;
    readonly stdout: Text;
    readonly stderr: Text;
    readonly ending: RunEnding;
}

export interface ProcessOptions {
    readonly input: Text;
    readonly timeoutMs: Milliseconds;
    readonly cwd: FsPath;
    readonly env: NodeJS.ProcessEnv;
    readonly killAfterMs?: Milliseconds;
}

export type ProcessRunner = (command: FsPath, args: readonly Text[], options: ProcessOptions) => Promise<ProcessOutcome>;

export type TreeKiller = (pid: Count, mode: KillMode) => void;

export interface ProcessPort {
    readonly run: ProcessRunner;
    readonly killTree: TreeKiller;
}
