import type { Count } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

export interface LastCommitRecord {
    readonly hash: Text;
    readonly subject: Text;
}

export type LastCommitOutcome = ({ readonly kind: 'commit' } & LastCommitRecord) | Unknown;

export interface UncommittedPathsRecord {
    readonly count: Count;
    readonly paths: readonly Text[];
}

export type UncommittedOutcome = ({ readonly kind: 'paths' } & UncommittedPathsRecord) | Unknown;

export interface WorksiteReaderPort {
    lastCommit(directory: Text): Promise<LastCommitOutcome>;
    uncommitted(directory: Text): Promise<UncommittedOutcome>;
}
