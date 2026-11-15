declare const marker: unique symbol;

export type Brand<Carrier, Name> = Carrier & { readonly [marker]: Name };

export type Result<T, E> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'err'; readonly error: E };
