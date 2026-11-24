import type { LaneTokenMap } from '#src/ports/lane-tokens.ts';
import { unknown, type Unknown } from '@stateforge-labs/session-ledger';
import type { TokenName } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { unownedName } from '#src/recap/domain/lane-tokens.ts';
import { parseText } from '@stateforge-labs/session-ledger';

export const refusalOfTokens = (tokens: LaneTokenMap, allowed: readonly TokenName[]): Unknown | null => {
    const foreign = unownedName([...tokens.keys()], allowed);
    return foreign === null ? null : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`refused: ${foreign} is not a tab-recap token name`))) });
};
