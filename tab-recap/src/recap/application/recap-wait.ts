import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

export const RECAP_WAIT_MS = 90_000;

export type RecapRefresh = (tab: string, lanes: readonly Lane[]) => Promise<RefreshStatus>;
