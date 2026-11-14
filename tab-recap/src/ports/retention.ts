import type { TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export interface Removed {
    readonly runs: number;
    readonly chapters: number;
    readonly boundaries: number;
    readonly compactions: number;
    readonly facts: number;
}

export interface Retention {
    expired(cutoff: number, protectedTabs: readonly TabId[]): readonly TabId[];
    remove(tab: string): Removed;
}

export type Retirement = 'retired' | 'nothing';

export interface TabRetirement {
    retire(tab: TabId, at: Instant): Retirement;
}
