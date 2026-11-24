import { claudeContextUse, readClaudeRecords } from '@stateforge-labs/harness-adapters/claude';
import type { ContextObserved as Observed } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

export function claudeObservedOf(lines: readonly Text[]): Observed | null {
    const use = claudeContextUse(readClaudeRecords(lines).records);
    return use === null ? null : { tokens: countOf(use.tokens), peak: countOf(use.peakTokens), window: null, model: use.model === null ? null : textOf(use.model) };
}
