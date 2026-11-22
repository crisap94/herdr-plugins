import { messageUsage, modelRef } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeMessage } from '@stateforge-labs/harness-adapters/opencode';
import type { Observed } from '#src/recap/domain/compaction.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { parseTextOrNull } from '#src/recap/domain/text.ts';

export function opencodeObserved(message: OpenCodeMessage): Observed | null {
    const usage = messageUsage(message);
    const total = usage.input + usage.cacheRead + usage.cacheWrite;
    return usage.role !== 'assistant' || total === 0 ? null : { tokens: countOf(total), peak: countOf(total), window: null, model: parseTextOrNull(modelRef(usage)) };
}
