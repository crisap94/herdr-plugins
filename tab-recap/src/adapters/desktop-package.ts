import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { CoreUnknown } from '../../../desktop/src/index.ts';

export * from '../../../desktop/src/index.ts';

export function unknownOfCore(failure: CoreUnknown): Unknown {
    const why = failure.why;
    return why.why === 'timeout' ? unknown({ why: 'timeout', after: duration(why.after) }) : unknown(why);
}
