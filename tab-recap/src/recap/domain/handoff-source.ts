import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export type HandoffSource = { readonly kind: 'live' } | { readonly kind: 'closed'; readonly closedAt: Instant };
