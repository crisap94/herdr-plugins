import type { Text } from '#src/recap/domain/text.ts';
import type { Usd } from '#src/recap/domain/usd.ts';
import type { Unknown } from './unknowable.ts';

export type Enumerated = { readonly kind: 'enumerated'; readonly text: Text; readonly costUsd: Usd } | Unknown;

export interface Enumerators {
    readonly backend: Text;
    readonly job: Text;
    write(document: Text): Promise<Enumerated>;
}
