export type Vetted = { readonly kind: 'ok'; readonly text: string } | { readonly kind: 'bad'; readonly why: string };
