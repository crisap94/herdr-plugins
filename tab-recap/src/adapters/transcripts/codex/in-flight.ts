import type { InFlightResult } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { openWork, readRollout } from '@stateforge-labs/harness-adapters/codex';

export const CODEX_IN_FLIGHT_INITIAL_BYTES = 2 * 1024 * 1024;
export const CODEX_IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

export function codexInFlight(lines: readonly string[], truncated: boolean): InFlightResult {
    const work = openWork(readRollout(lines).rows);
    if (truncated && work.openCallIds.length > 0) {
        return unknown({ why: 'unreadable', detail: 'the truncated rollout tail contains an open call' });
    }
    return { kind: 'in-flight', count: work.openCallIds.length + work.runningCells.length, background: [] };
}
