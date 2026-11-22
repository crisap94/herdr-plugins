import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export interface HarnessesAvailable {
    readonly kind: 'available';
    readonly ids: readonly AgentKind[];
}

export type HarnessList = HarnessesAvailable | Unknown;

export interface HarnessDirectory {
    available(): Promise<HarnessList>;
}
