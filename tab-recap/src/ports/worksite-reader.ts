import type { Unknown } from './unknowable.ts';

export interface LastCommit {
    readonly hash: string;
    readonly subject: string;
}

export type LastCommitResult = ({ readonly kind: 'commit' } & LastCommit) | Unknown;

export interface UncommittedPaths {
    readonly count: number;
    readonly paths: readonly string[];
}

export type UncommittedResult = ({ readonly kind: 'paths' } & UncommittedPaths) | Unknown;

export interface WorksiteReader {
    lastCommit(directory: string): Promise<LastCommitResult>;
    uncommitted(directory: string): Promise<UncommittedResult>;
}
