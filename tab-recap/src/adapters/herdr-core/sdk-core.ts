import { unknown, exitCodeOf } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { duration } from '@stateforge-labs/session-ledger';
import type { Unknown as CoreUnknown } from '@stateforge-labs/herdr-sdk/core';
export * from '@stateforge-labs/herdr-sdk/core';
export function unknownOfCore(failure: CoreUnknown): Unknown {
    const why = failure.why;
    if (why.why === 'timeout') return unknown({ why: 'timeout', after: duration(why.after) });
    if (why.why === 'not-found') return unknown({ why: 'not-found', what: textOf(why.what) });
    if (why.why === 'failed') return unknown({ why: 'failed', code: exitCodeOf(why.code), detail: causeOf(must(parseText(why.detail))) });
    return unknown({ ...why, detail: causeOf(must(parseText(why.detail))) });
}
