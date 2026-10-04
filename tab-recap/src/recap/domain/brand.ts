declare const marker: unique symbol;

export type Brand<Carrier, Name extends string> = Carrier & { readonly [marker]: Name };
