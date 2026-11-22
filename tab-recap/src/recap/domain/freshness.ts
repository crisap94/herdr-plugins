import type { RunCause } from './session-facts.ts';
import type { LaneStatus } from './status.ts';
import type { Count } from './count.ts';
import type { Text } from './text.ts';
import type { Instant } from './time.ts';

export const REFRESH_STATUSES = ['not-requested', 'refreshed', 'failed', 'timed-out'] as const;
export type RefreshStatus = (typeof REFRESH_STATUSES)[number];

export type LastRunCause = RunCause | 'imported';

export type WaitResult = 'done' | 'timeout';

export interface LastRun {
    readonly at: Instant;
    readonly cause: LastRunCause;
}

export type NewerPrompts = { readonly kind: 'none' } | { readonly kind: 'at-least'; readonly count: Count } | { readonly kind: 'unknown' };

export function refreshStatusOf(waited: WaitResult, error: Text | null): RefreshStatus {
    if (waited === 'timeout') {
        return 'timed-out';
    }
    return error === null ? 'refreshed' : 'failed';
}

export function newerPromptsOf(count: Count | null): NewerPrompts {
    if (count === null) {
        return { kind: 'unknown' };
    }
    return count > 0 ? { kind: 'at-least', count } : { kind: 'none' };
}

export interface Freshness {
    readonly lastRun: LastRun;
    readonly status: LaneStatus;
    readonly newerPrompts: NewerPrompts;
    readonly refresh: RefreshStatus;
}
