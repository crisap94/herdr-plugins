import { SECTION_IDS } from '@stateforge-labs/session-ledger';
import type { FactId } from '@stateforge-labs/session-ledger';
import type { HandoffReason } from './handoff-outcome.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import type { Freshness } from './freshness.ts';
import type { HandoffText } from './handoff-sanitize.ts';
import type { WorksiteSnapshot } from './worksite.ts';

export const HANDOFF_GROUP_IDS = [...SECTION_IDS, 'closed'] as const;
export type HandoffGroupId = (typeof HANDOFF_GROUP_IDS)[number];

export interface HandoffEntry {
    readonly id: FactId;
    readonly text: HandoffText;
    readonly firstAt: Instant;
    readonly lastAt: Instant;
    readonly reason: HandoffText | null;
}

export interface HandoffGroup {
    readonly id: HandoffGroupId;
    readonly entries: readonly HandoffEntry[];
    readonly capped: Count;
}

export interface HandoffBody {
    readonly kind: 'content';
    readonly note: HandoffText | null;
    readonly freshness: Freshness;
    readonly worksite: WorksiteSnapshot;
    readonly groups: readonly HandoffGroup[];
    readonly withheld: Count;
}

type Ordering = -1 | 0 | 1;

export const compareIds = (a: FactId, b: FactId): Ordering => {
    if (a === b) {
        return 0;
    }
    return a < b ? -1 : 1;
};

export type HandoffRefusal = Extract<HandoffReason, 'ledger-empty' | 'content-empty'>;

export type HandoffContent = HandoffBody | { readonly kind: 'refused'; readonly reason: HandoffRefusal };
