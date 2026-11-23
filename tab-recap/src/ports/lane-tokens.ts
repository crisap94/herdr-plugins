import type { TokenName, TokenValue } from '#src/protocol/primitives.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import type { Done } from './columns.ts';

export type LaneTokenMap = ReadonlyMap<TokenName, TokenValue | null>;

export interface LaneTokenReporter {
    report(pane: PaneId, tokens: LaneTokenMap, ttlMs: Milliseconds): Promise<Done>;
}
