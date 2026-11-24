import type { Count } from '@stateforge-labs/session-ledger';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Milliseconds } from '@stateforge-labs/session-ledger';

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
