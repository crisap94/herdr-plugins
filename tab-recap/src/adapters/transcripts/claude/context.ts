import { claudeContextUse, readClaudeRecords } from '@stateforge-labs/harness-adapters/claude';
import type { Observed } from '#src/recap/domain/compaction.ts';
import type { Text } from '#src/recap/domain/text.ts';

export { claudeObserved } from './legacy.ts';

export function claudeObservedOf(lines: readonly Text[]): Observed | null {
    const use = claudeContextUse(readClaudeRecords(lines).records);
    return use === null ? null : { tokens: use.tokens, peak: use.peakTokens, window: null, model: use.model };
}
