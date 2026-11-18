import type { RunCause } from './session-facts.ts';
import type { LaneStatus } from './status.ts';
import type { LastRun, NewerPrompts } from './legacy.ts';

export { newerPromptsOf, refreshStatusOf, type LastRun, type NewerPrompts } from './legacy.ts';

export const REFRESH_STATUSES = ['not-requested', 'refreshed', 'failed', 'timed-out'] as const;
export type RefreshStatus = (typeof REFRESH_STATUSES)[number];

export type LastRunCause = RunCause | 'imported';

export type WaitResult = 'done' | 'timeout';

export interface Freshness {
    readonly lastRun: LastRun;
    readonly status: LaneStatus;
    readonly newerPrompts: NewerPrompts;
    readonly refresh: RefreshStatus;
}
