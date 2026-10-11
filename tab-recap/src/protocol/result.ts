export type Result<T, E> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'err'; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ kind: 'ok', value });

export const err = <E>(error: E): Result<never, E> => ({ kind: 'err', error });

export function must<T, E>(result: Result<T, E>): T {
    if (result.kind === 'err') {
        throw new Error(`token protocol refused a load-time constant: ${JSON.stringify(result.error)}`);
    }
    return result.value;
}
