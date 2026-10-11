declare const marker: unique symbol;

export type Brand<Carrier, Name> = Carrier & { readonly [marker]: Name };

export function brand<Carrier, Name>(carrier: Carrier): Brand<Carrier, Name> {
    return carrier as Brand<Carrier, Name>;
}
