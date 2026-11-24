import { messageUsage, modelRef } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeMessage } from '@stateforge-labs/harness-adapters/opencode';
import type { ContextObserved as Observed } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { parseTextOrNull } from '@stateforge-labs/session-ledger';

export function opencodeObserved(message: OpenCodeMessage): Observed | null {
    const usage = messageUsage(message);
    const total = usage.input + usage.cacheRead + usage.cacheWrite;
    return usage.role !== 'assistant' || total === 0 ? null : { tokens: countOf(total), peak: countOf(total), window: null, model: parseTextOrNull(modelRef(usage)) };
}
