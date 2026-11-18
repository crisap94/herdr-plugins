import { SECTION_IDS } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import type { FactId } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import type { HandoffReason } from './handoff-outcome.ts';
import type { HandoffBody } from './legacy.ts';

export type { HandoffBody, HandoffEntry, HandoffGroup } from './legacy.ts';

export const HANDOFF_GROUP_IDS = [...SECTION_IDS, 'closed'] as const;
export type HandoffGroupId = (typeof HANDOFF_GROUP_IDS)[number];

type Ordering = -1 | 0 | 1;

export const compareIds = (a: FactId, b: FactId): Ordering => {
    if (a === b) {
        return 0;
    }
    return a < b ? -1 : 1;
};

export type HandoffRefusal = Extract<HandoffReason, 'ledger-empty' | 'content-empty'>;

export type HandoffContent = HandoffBody | { readonly kind: 'refused'; readonly reason: HandoffRefusal };
