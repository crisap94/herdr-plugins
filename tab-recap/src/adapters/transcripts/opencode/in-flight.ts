import { isToolInFlight, parsePart } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeStore } from '@stateforge-labs/harness-adapters/opencode/store';
import type { InFlightResult } from '#src/ports/transcripts.ts';

export function opencodeInFlight(store: Pick<OpenCodeStore, 'recentParts'>, session: string, messageLimit: number): InFlightResult {
    const count = store.recentParts(session, messageLimit).reduce((total, raw) => {
        const part = parsePart(raw);
        return part.ok && isToolInFlight(part.record) ? total + 1 : total;
    }, 0);
    return { kind: 'in-flight', count, background: [] };
}
