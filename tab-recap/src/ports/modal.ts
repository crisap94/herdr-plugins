import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { Done } from './columns.ts';
import type { Unknown } from '@stateforge-labs/session-ledger';

export type SetupOpened = { readonly kind: 'opened' } | { readonly kind: 'busy' } | Unknown;

export interface ModalHost {
    show(tab: ScopeId): Promise<Done>;
    setup(tab: ScopeId | null): Promise<SetupOpened>;
}
