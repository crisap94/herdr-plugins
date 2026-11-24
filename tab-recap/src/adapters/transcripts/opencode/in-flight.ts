import { isToolInFlight, parsePart } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeStore } from '@stateforge-labs/harness-adapters/opencode/store';
import type { InFlightResult } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { runningOf } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';

export function opencodeInFlight(store: Pick<OpenCodeStore, 'recentParts'>, session: Text, messageLimit: Count): InFlightResult {
    const count = store.recentParts(session, messageLimit).reduce((total, raw) => {
        const part = parsePart(raw);
        return part.ok && isToolInFlight(part.record) ? total + 1 : total;
    }, 0);
    return { kind: 'in-flight', count: runningOf(count), background: [] };
}
