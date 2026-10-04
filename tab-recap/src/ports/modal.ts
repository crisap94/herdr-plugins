import type { TabId } from '#src/recap/domain/ids.ts';
import type { Done } from './columns.ts';
import type { Unknown } from './unknowable.ts';

/** `busy`: herdr already shows another modal; the operator has to close it first. */
export type SetupOpened = { readonly kind: 'opened' } | { readonly kind: 'busy' } | Unknown;

/** The recap of a tab, shown on demand over everything — the phone's view of it. */
export interface ModalHost {
    show(tab: TabId): Promise<Done>;
    /** The settings modal, remembering the tab it was opened from (null when unknown). */
    setup(tab: TabId | null): Promise<SetupOpened>;
}
