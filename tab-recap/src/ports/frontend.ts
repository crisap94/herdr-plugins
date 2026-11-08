import type { CurrentSession } from '#src/recap/application/lane-recent.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { Fleet } from './fleet.ts';
import type { NonEmptyText } from '#src/recap/domain/text.ts';

export interface Frontend {
    readonly fleet: Fleet;
    readonly session: CurrentSession;
    wrap(store: Store, log: (line: NonEmptyText) => void): Store;
}
