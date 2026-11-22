import type { Text } from '#src/recap/domain/text.ts';
import type { Enumerated } from './legacy.ts';

export type { Enumerated } from './legacy.ts';

export interface Enumerators {
    readonly backend: Text;
    readonly job: Text;
    write(document: Text): Promise<Enumerated>;
}
