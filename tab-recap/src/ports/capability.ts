import type { Capability } from './twins/legacy.ts';

export type { Capability } from './twins/legacy.ts';
export { unsupportedCapability } from './twins/legacy.ts';

export const supported = <Value>(value: Value): Capability<Value, never> => ({ kind: 'supported', value });

export interface SupportedValue<Value> {
    readonly kind: 'supported';
    readonly value: Value;
}

export interface UnsupportedWhy<Why> {
    readonly kind: 'unsupported';
    readonly why: Why;
}

export type Support<Value, Why> = SupportedValue<Value> | UnsupportedWhy<Why>;

export const unsupported = <Why>(why: Why): Support<never, Why> => ({ kind: 'unsupported', why });
