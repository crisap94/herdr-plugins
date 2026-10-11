export type ParseFailure =
    | { readonly kind: 'not-a-string' }
    | { readonly kind: 'not-a-number' }
    | { readonly kind: 'empty' }
    | { readonly kind: 'not-an-integer' }
    | { readonly kind: 'not-a-row' }
    | { readonly kind: 'out-of-range' };
