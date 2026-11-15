import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { Unknown as CoreUnknown } from '@stateforge-labs/herdr-sdk/core';
export * from '@stateforge-labs/herdr-sdk/core';
export function unknownOfCore(failure: CoreUnknown): Unknown {
    const why = failure.why;
    if (why.why === 'timeout') return unknown({ why: 'timeout', after: duration(why.after) });
    if (why.why === 'not-found') return unknown({ why: 'not-found', what: why.what });
    return unknown({ ...why, detail: causeOf(must(parseText(why.detail))) });
}
