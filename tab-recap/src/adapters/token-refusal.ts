import { unownedName } from '#src/recap/domain/lane-tokens.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';

export const refusalOf = (tokens: Readonly<Record<string, string | null>>, allowed: readonly string[]): Unknown | null => {
    const foreign = unownedName(Object.keys(tokens), allowed);
    return foreign === null ? null : unknown({ why: 'unreadable', detail: `refused: ${foreign} is not a tab-recap token name` });
};
