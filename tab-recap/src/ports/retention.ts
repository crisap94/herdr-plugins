import type { Count } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { Instant } from '@stateforge-labs/session-ledger';

export interface RemovedCounts {
    readonly runs: Count;
    readonly chapters: Count;
    readonly boundaries: Count;
    readonly compactions: Count;
    readonly facts: Count;
}

export interface RetentionPort {
    expired(cutoff: Instant, protectedTabs: readonly ScopeId[]): readonly ScopeId[];
    remove(tab: ScopeId): RemovedCounts;
}

export type Retirement = 'retired' | 'nothing';

export interface TabRetirement {
    retire(tab: ScopeId, at: Instant): Retirement;
}
