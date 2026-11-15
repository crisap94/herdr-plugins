import { unownedName } from '#src/recap/domain/lane-tokens.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Unknown } from '#src/ports/unknowable.ts';

export const refusalOf = (tokens: Readonly<Record<string, string | null>>, allowed: readonly string[]): Unknown | null => {
    const foreign = unownedName(Object.keys(tokens), allowed);
    return foreign === null ? null : unknown({ why: 'unreadable', detail: causeOf(must(parseText(`refused: ${foreign} is not a tab-recap token name`))) });
};
