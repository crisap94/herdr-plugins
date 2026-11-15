import type { RunCause } from './session-facts.ts';
import type { LaneStatus } from './status.ts';

export const REFRESH_STATUSES = ['not-requested', 'refreshed', 'failed', 'timed-out'] as const;
export type RefreshStatus = (typeof REFRESH_STATUSES)[number];

export type LastRunCause = RunCause | 'imported';

export type WaitResult = 'done' | 'timeout';

export function refreshStatusOf(waited: WaitResult, error: string | null): RefreshStatus {
    if (waited === 'timeout') {
        return 'timed-out';
    }
    return error === null ? 'refreshed' : 'failed';
}

export type NewerPrompts = { readonly kind: 'none' } | { readonly kind: 'at-least'; readonly count: number } | { readonly kind: 'unknown' };

export function newerPromptsOf(count: number | null): NewerPrompts {
    if (count === null) {
        return { kind: 'unknown' };
    }
    return count > 0 ? { kind: 'at-least', count } : { kind: 'none' };
}

interface LastRun {
    readonly at: number;
    readonly cause: LastRunCause;
}

export interface Freshness {
    readonly lastRun: LastRun;
    readonly status: LaneStatus;
    readonly newerPrompts: NewerPrompts;
    readonly refresh: RefreshStatus;
}
