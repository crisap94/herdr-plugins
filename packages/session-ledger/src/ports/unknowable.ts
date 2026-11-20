import type { FailureCause } from '#src/recap/domain/failure-cause.ts';
import type { Unknowable } from './legacy.ts';

export { isUnknown, saying } from './legacy.ts';
export type { Unknowable } from './legacy.ts';

export type Unknown = { readonly kind: 'unknown'; readonly why: Unknowable };

export function unknown(why: Unknowable): Unknown {
    return { kind: 'unknown', why };
}

export function unreadableOf(cause: FailureCause): Unknown {
    return unknown({ why: 'unreadable', detail: cause });
}
