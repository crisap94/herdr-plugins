import type { Duration } from '#src/recap/domain/time.ts';

/** Every fallible read returns this instead of throwing. */
export type Unknowable =
    | { readonly why: 'timeout'; readonly after: Duration }
    | { readonly why: 'unreadable'; readonly detail: string }
    | { readonly why: 'unreachable'; readonly detail: string }
    | { readonly why: 'not-found'; readonly what: string }
    | { readonly why: 'failed'; readonly code: number; readonly detail: string }
    /** another tool holds the pane's typing lease: the compaction is not typed */
    | { readonly why: 'lease'; readonly after: Duration };

export type Unknown = { readonly kind: 'unknown'; readonly why: Unknowable };

export function unknown(why: Unknowable): Unknown {
    return { kind: 'unknown', why };
}

/** Every port result is a sum type discriminated on `kind`; this is its failure branch. */
export function isUnknown(result: { readonly kind: string }): result is Unknown {
    return result.kind === 'unknown';
}

export function saying(unknowable: Unknowable): string {
    switch (unknowable.why) {
        case 'timeout':
            return `timed out after ${unknowable.after} ms`;
        case 'unreadable':
            return `unreadable: ${unknowable.detail}`;
        case 'unreachable':
            return `unreachable: ${unknowable.detail}`;
        case 'not-found':
            return `${unknowable.what} not found`;
        case 'failed':
            return `exited ${unknowable.code}: ${unknowable.detail}`;
        case 'lease':
            return `another tool is typing into the pane (waited ${unknowable.after} ms for its lease)`;
        default: {
            const exhaustive: never = unknowable;
            return String(exhaustive);
        }
    }
}
