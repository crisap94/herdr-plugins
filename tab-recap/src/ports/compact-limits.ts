import type { Count } from '@stateforge-labs/session-ledger';
import type { HarnessKind, SessionId } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';

export interface CompactLimit {
    readonly window: Count | null;
    readonly percent: Count | null;
}

export interface CompactLimits {
    limitOf(kind: HarnessKind, model: Text | null, cwd: Directory | null, session: SessionId | null): CompactLimit;
}
