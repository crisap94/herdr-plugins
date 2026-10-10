// How long a pane's writes wait after failures: doubling from 2 s, at most 60 s. Pure.
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 60_000;

/** The wait after `failures` failures in a row; none before the first. */
export const backoffMs = (failures: number): number => (failures <= 0 ? 0 : Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1)));
