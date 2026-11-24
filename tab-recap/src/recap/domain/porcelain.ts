import type { Count } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';

export type BranchName = Text;
export type AheadCount = Count | null;
export type TrackedCount = Count;
export type UntrackedCount = Count;

export interface PorcelainReading {
    readonly branch: BranchName;
    readonly ahead: AheadCount;
    readonly tracked: TrackedCount;
    readonly untracked: UntrackedCount;
}
