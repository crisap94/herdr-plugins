import { claudeContextUse, readClaudeRecords } from '@stateforge-labs/harness-adapters/claude';
import type { Observed } from '#src/recap/domain/compaction.ts';

export function claudeObserved(lines: readonly string[]): Observed | null {
    const use = claudeContextUse(readClaudeRecords(lines).records);
    return use === null ? null : { tokens: use.tokens, peak: use.peakTokens, window: null, model: use.model };
}
