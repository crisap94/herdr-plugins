import type { TabId } from '#src/recap/domain/ids.ts';
import type { Done } from './columns.ts';
import type { Unknown } from './unknowable.ts';

export type SetupOpened = { readonly kind: 'opened' } | { readonly kind: 'busy' } | Unknown;

export interface ModalHost {
    show(tab: TabId): Promise<Done>;
    setup(tab: TabId | null): Promise<SetupOpened>;
}
