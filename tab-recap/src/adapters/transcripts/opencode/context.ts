import { messageUsage, modelRef } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeMessage } from '@stateforge-labs/harness-adapters/opencode';
import type { Observed } from '#src/recap/domain/compaction.ts';

export function opencodeObserved(message: OpenCodeMessage): Observed | null {
    const usage = messageUsage(message);
    const total = usage.input + usage.cacheRead + usage.cacheWrite;
    return usage.role !== 'assistant' || total === 0 ? null : { tokens: total, peak: total, window: null, model: modelRef(usage) };
}
