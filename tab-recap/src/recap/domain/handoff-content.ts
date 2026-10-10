import { SECTION_IDS } from './fact.ts';
import type { FactId } from './fact.ts';
import type { Freshness } from './freshness.ts';
import type { HandoffReason } from './handoff-outcome.ts';
import type { HandoffId } from './ids.ts';
import type { WorksiteSnapshot } from './worksite.ts';

export const HANDOFF_GROUP_IDS = [...SECTION_IDS, 'closed'] as const;
export type HandoffGroupId = (typeof HANDOFF_GROUP_IDS)[number];

export interface HandoffEntry {
    readonly id: FactId;
    readonly text: string;
    readonly firstAt: number;
    readonly lastAt: number;
    readonly reason: string | null;
}

export interface HandoffGroup {
    readonly id: HandoffGroupId;
    readonly entries: readonly HandoffEntry[];
    readonly capped: number;
}

export interface HandoffBody {
    readonly kind: 'content';
    readonly id: HandoffId;
    readonly at: number;
    readonly note: string | null;
    readonly freshness: Freshness;
    readonly worksite: WorksiteSnapshot;
    readonly groups: readonly HandoffGroup[];
    readonly withheld: number;
}

export type HandoffRefusal = Extract<HandoffReason, 'ledger-empty' | 'content-empty'>;

export type HandoffContent = HandoffBody | { readonly kind: 'refused'; readonly reason: HandoffRefusal };
