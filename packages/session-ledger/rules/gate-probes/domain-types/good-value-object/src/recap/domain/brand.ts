declare const marker: unique symbol;

export type Brand<Carrier, Name> = Carrier & { readonly [marker]: Name };

export declare function brand<Carrier, Name>(carrier: Carrier, name: Name): Brand<Carrier, Name>;
