import type { HarnessKind } from '#src/recap/domain/ids.ts';
import type { Unknown } from '@stateforge-labs/session-ledger';

export interface HarnessesAvailable {
    readonly kind: 'available';
    readonly ids: readonly HarnessKind[];
}

export type HarnessList = HarnessesAvailable | Unknown;

export interface HarnessDirectory {
    available(): Promise<HarnessList>;
}
