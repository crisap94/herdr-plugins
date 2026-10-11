export type Outcome = { readonly kind: 'ok'; readonly value: number } | { readonly kind: 'err'; readonly error: string };
