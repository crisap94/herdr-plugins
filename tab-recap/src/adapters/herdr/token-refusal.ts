import type { LaneTokenMap } from '#src/ports/lane-tokens.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import type { TokenName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { unownedName } from '#src/recap/domain/lane-tokens.ts';
import { parseText } from '#src/recap/domain/text.ts';

export const refusalOfTokens = (tokens: LaneTokenMap, allowed: readonly TokenName[]): Unknown | null => {
    const foreign = unownedName([...tokens.keys()], allowed);
    return foreign === null ? null : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`refused: ${foreign} is not a tab-recap token name`))) });
};
