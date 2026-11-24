import type { WindowOf } from '@stateforge-labs/session-ledger';
import type { HarnessKind } from '#src/recap/domain/ids.ts';

export interface ContextWindowLookup {
    windowOf(kind: HarnessKind): WindowOf;
}
