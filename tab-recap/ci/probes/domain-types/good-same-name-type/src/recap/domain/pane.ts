import type { Brand } from './brand.js';

export type Iso = Brand<string, 'Iso'>;

export interface Date {
    readonly iso: Iso;
}

export interface Buffer {
    readonly bytes: Iso;
}

export function pick(date: Date, buffer: Buffer): Iso {
    return buffer.bytes === date.iso ? date.iso : buffer.bytes;
}
