import type { Count } from '#src/recap/domain/count.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface RemovedCounts {
    readonly runs: Count;
    readonly chapters: Count;
    readonly boundaries: Count;
    readonly compactions: Count;
    readonly facts: Count;
}

export interface RetentionPort {
    expired(cutoff: Instant, protectedTabs: readonly TabId[]): readonly TabId[];
    remove(tab: TabId): RemovedCounts;
}

export type Retirement = 'retired' | 'nothing';

export interface TabRetirement {
    retire(tab: TabId, at: Instant): Retirement;
}
