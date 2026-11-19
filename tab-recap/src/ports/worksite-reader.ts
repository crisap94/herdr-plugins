import type { Count } from '#src/recap/domain/count.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type { LastCommit, LastCommitResult, UncommittedPaths, UncommittedResult, WorksiteReader } from './twins/legacy.ts';

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
