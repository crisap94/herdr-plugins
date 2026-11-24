import type { TokenName, TokenValue } from '#src/protocol/primitives.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Milliseconds } from '@stateforge-labs/session-ledger';
import type { Done } from './columns.ts';

export type LaneTokenMap = ReadonlyMap<TokenName, TokenValue | null>;

export interface LaneTokenReporter {
    report(pane: SessionKey, tokens: LaneTokenMap, ttlMs: Milliseconds): Promise<Done>;
}
