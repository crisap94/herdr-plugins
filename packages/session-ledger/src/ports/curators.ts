import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from './unknowable.ts';

export type CuratorMode = 'story' | 'reconcile';

export type Curated = { readonly kind: 'curated'; readonly text: Text } | Unknown;

export interface Curators {
    readonly backend: Text;
    write(document: Text, mode?: CuratorMode): Promise<Curated>;
}
