import type { Count } from '#src/recap/domain/count.ts';
import type { HarnessKind, SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Directory } from '@stateforge-labs/session-ledger/unstable/recap/domain/directory.ts';

export interface CompactLimit {
    readonly window: Count | null;
    readonly percent: Count | null;
}

export interface CompactLimits {
    limitOf(kind: HarnessKind, model: Text | null, cwd: Directory | null, session: SessionId | null): CompactLimit;
}
