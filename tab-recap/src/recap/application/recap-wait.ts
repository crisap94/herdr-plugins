import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';

export const RECAP_WAIT_MS = 90_000;

export type RecapRefresh = (tab: ScopeId, lanes: readonly FollowedSession[]) => Promise<RefreshStatus>;
