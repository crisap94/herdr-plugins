import type { Text } from '#src/recap/domain/text.ts';
import type { Curated } from './legacy.ts';

export type CuratorMode = 'story' | 'reconcile';

export type { Curated } from './legacy.ts';

export interface Curators {
    readonly backend: Text;
    write(document: Text, mode?: CuratorMode): Promise<Curated>;
}
