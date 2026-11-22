import type { Count } from './count.ts';
import { duration, type Duration } from './time.ts';

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 60_000;

export function backoffMs(failures: Count): Duration { return duration(failures <= 0 ? 0 : Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1))); }
