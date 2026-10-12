import type { Instant } from './time.ts';

export type HandoffSource = { readonly kind: 'live' } | { readonly kind: 'closed'; readonly closedAt: Instant };
