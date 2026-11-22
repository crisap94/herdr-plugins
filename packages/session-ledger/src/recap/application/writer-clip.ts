import type { Count } from '#src/contract/kernel.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';

const KEEP = { user: [700, 300], agent: [300, 900] } as const;

const GAP = '\n[…]\n';

export type ClipRole = 'user' | 'agent';
export type WasClipped = Brand<boolean, 'WasClipped'>;

export interface Clipped {
    readonly text: Text;
    readonly clipped: WasClipped;
}

const textOf = brand<string, 'Text'>;
const clippedOf = brand<boolean, 'WasClipped'>;

export function clipTurn(role: ClipRole, value: Text): Clipped {
    const [head, tail] = KEEP[role];
    const body = value.trim();
    return body.length <= head + tail ? { text: textOf(body), clipped: clippedOf(false) } : { text: textOf(`${body.slice(0, head).trimEnd()}${GAP}${body.slice(-tail).trimStart()}`), clipped: clippedOf(true) };
}

export function clipHead(value: Text, max: Count): Clipped {
    const body = value.trim();
    return body.length <= max ? { text: textOf(body), clipped: clippedOf(false) } : { text: textOf(body.slice(0, max).trimEnd()), clipped: clippedOf(true) };
}
