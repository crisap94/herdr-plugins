import type { Instant } from '@stateforge-labs/session-ledger';

export type HandoffSource = { readonly kind: 'live' } | { readonly kind: 'closed'; readonly closedAt: Instant };
