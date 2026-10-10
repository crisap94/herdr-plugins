import type { RunCause } from './session-facts.ts';
import type { LaneStatus } from './status.ts';

export const REFRESH_STATUSES = ['not-requested', 'refreshed', 'failed', 'timed-out'] as const;
export type RefreshStatus = (typeof REFRESH_STATUSES)[number];

export type LastRunCause = RunCause | 'imported';

export type NewerPrompts = { readonly kind: 'none' } | { readonly kind: 'at-least'; readonly count: number } | { readonly kind: 'unknown' };

export function newerPromptsOf(count: number | null): NewerPrompts {
    if (count === null) {
        return { kind: 'unknown' };
    }
    return count > 0 ? { kind: 'at-least', count } : { kind: 'none' };
}

export interface Freshness {
    readonly lastRun: { readonly at: number; readonly cause: LastRunCause };
    readonly status: LaneStatus;
    readonly newerPrompts: NewerPrompts;
    readonly refresh: RefreshStatus;
}
