import type { InFlightResult } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { runningOf } from '@stateforge-labs/session-ledger';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { openWork, readRollout } from '@stateforge-labs/harness-adapters/codex';

export const CODEX_IN_FLIGHT_INITIAL_BYTES = 2 * 1024 * 1024;
export const CODEX_IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

export function codexInFlightOf(lines: readonly Text[], truncated: Presence): InFlightResult {
    const work = openWork(readRollout(lines).rows);
    if (truncated === 'present' && work.openCallIds.length > 0) {
        return unknown({ why: 'unreadable', detail: causeOf(must(parseText('the truncated rollout tail contains an open call'))) });
    }
    return { kind: 'in-flight', count: runningOf(work.openCallIds.length + work.runningCells.length), background: [] };
}
