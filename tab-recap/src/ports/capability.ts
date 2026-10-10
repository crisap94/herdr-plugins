export type Capability<Value, Why extends string> =
    | { readonly kind: 'supported'; readonly value: Value }
    | { readonly kind: 'unsupported'; readonly why: Why };

export const supported = <Value>(value: Value): Capability<Value, never> => ({ kind: 'supported', value });

export const unsupportedCapability = <Why extends string>(why: Why): Capability<never, Why> => ({ kind: 'unsupported', why });
