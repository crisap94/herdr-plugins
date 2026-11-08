import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { Unknown as CoreUnknown } from '@stateforge-labs/herdr-sdk/core';
export * from '@stateforge-labs/herdr-sdk/core';
export function unknownOfCore(failure: CoreUnknown): Unknown {
    const why = failure.why;
    return why.why === 'timeout' ? unknown({ why: 'timeout', after: duration(why.after) }) : unknown(why);
}
