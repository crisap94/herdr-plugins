import type { TabId } from '#src/recap/domain/ids.ts';

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
