import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

export const RECAP_WAIT_MS = 90_000;

export type RecapRefresh = (tab: TabId, lanes: readonly Lane[]) => Promise<RefreshStatus>;
