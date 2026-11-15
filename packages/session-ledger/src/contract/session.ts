import type { Unknown } from './kernel.ts';
import type { Directory, HarnessKind, SessionId, SessionKey } from './ids.ts';

export interface FollowedSession {
    readonly key: SessionKey;
    readonly harness: HarnessKind;
    readonly session: SessionId | null;
    readonly cwd: Directory | null;
    readonly title: string | null;
}
export type RecapCause = 'turn-ended' | 'focused' | 'requested';

export interface Position {
    readonly cursor: number;
    readonly tail: string | null;
}

export const UNREAD: Position = { cursor: 0, tail: null };

export interface Chunk { readonly pendingStep: 'FND-2c' }
export interface Located { readonly pendingStep: 'FND-2c' }

export interface SessionReader {
    readonly harness: HarnessKind;
    locate(session: FollowedSession): Promise<Located>;
    read(source: string, was: Position, budget: number): Promise<Chunk | Unknown>;
}
export interface SessionSource {
    readerFor(harness: HarnessKind): SessionReader | undefined;
    unavailableReason(harness: HarnessKind): string;
}
