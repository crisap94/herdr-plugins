import type { Directory } from '@stateforge-labs/session-ledger';
import type { HarnessKind } from '#src/recap/domain/ids.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { LastRun } from '@stateforge-labs/session-ledger';

export interface ClosedView {
    readonly closedAt: Instant;
    readonly agent: HarnessKind;
    readonly cwd: Directory | null;
    readonly run: LastRun | null;
}
