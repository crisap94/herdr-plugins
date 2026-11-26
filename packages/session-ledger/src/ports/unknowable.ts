import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { FailureCause } from '#src/recap/domain/failure-cause.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { Duration } from '#src/recap/domain/time.ts';

export type ExitCode = Brand<number, 'ExitCode'>;

export const exitCodeOf = brand<number, 'ExitCode'>;

export type Unknowable =
    | { readonly why: 'timeout'; readonly after: Duration }
    | { readonly why: 'unreadable'; readonly detail: FailureCause }
    | { readonly why: 'unreachable'; readonly detail: FailureCause }
    | { readonly why: 'not-found'; readonly what: Text }
    | { readonly why: 'failed'; readonly code: ExitCode; readonly detail: FailureCause }
    | { readonly why: 'lease'; readonly after: Duration };

export type Unknown = { readonly kind: 'unknown'; readonly why: Unknowable };

export function unknown(why: Unknowable): Unknown {
    return { kind: 'unknown', why };
}

export function unreadableOf(cause: FailureCause): Unknown {
    return unknown({ why: 'unreadable', detail: cause });
}

export function isUnknown<Other>(result: Other | Unknown): result is Extract<Other | Unknown, Unknown> {
    const seen: unknown = result;
    return typeof seen === 'object' && seen !== null && 'kind' in seen && seen.kind === 'unknown';
}

export function saying(unknowable: Unknowable): Text {
    switch (unknowable.why) {
        case 'timeout':
            return textOf(`timed out after ${unknowable.after} ms`);
        case 'unreadable':
            return textOf(`unreadable: ${unknowable.detail}`);
        case 'unreachable':
            return textOf(`unreachable: ${unknowable.detail}`);
        case 'not-found':
            return textOf(`${unknowable.what} not found`);
        case 'failed':
            return textOf(`exited ${unknowable.code}: ${unknowable.detail}`);
        case 'lease':
            return textOf(`another tool is typing into the session (waited ${unknowable.after} ms for its lease)`);
        default: {
            const exhaustive: never = unknowable;
            return textOf(String(exhaustive));
        }
    }
}
