import { brand, type Brand } from '../recap/domain/brand.ts';

export type { Brand };

export type Result<T, E> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'err'; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ kind: 'ok', value });

export const err = <E>(error: E): Result<never, E> => ({ kind: 'err', error });

export type Instant = Brand<number, 'Instant'>;
export type Duration = Brand<number, 'Duration'>;

export const instant = brand<number, 'Instant'>;

export type ParseFailure =
    | { readonly kind: 'not-a-string' }
    | { readonly kind: 'not-a-number' }
    | { readonly kind: 'empty' }
    | { readonly kind: 'not-an-integer' }
    | { readonly kind: 'not-a-row' }
    | { readonly kind: 'out-of-range' };

export type Text = Brand<string, 'Text'>;
export type Count = Brand<number, 'Count'>;
export type Usd = Brand<number, 'Usd'>;
export type Probability = Brand<number, 'Probability'>;
export type AutocompactPercent = Brand<number, 'AutocompactPercent'>;
export type TabId = Brand<string, 'TabId'>;
export type PaneId = Brand<string, 'PaneId'>;
export type AgentKind = Brand<string, 'AgentKind'>;
export type DecisionId = Brand<string, 'DecisionId'>;
export type FailureCause = Brand<string, 'FailureCause'>;
export type ExitCode = Brand<number, 'ExitCode'>;

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

export function isUnknown<Other>(result: Other | Unknown): result is Extract<Other | Unknown, Unknown> {
    const seen: unknown = result;
    return typeof seen === 'object' && seen !== null && 'kind' in seen && seen.kind === 'unknown';
}
