import type { ContextObserved as Observed } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import { contextUsage, readRollout } from '@stateforge-labs/harness-adapters/codex';
import { countOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

export function codexObservedOf(lines: readonly Text[]): Observed | null {
    const usage = contextUsage(readRollout(lines).rows);
    if (usage === null) {
        return null;
    }
    const tokens = usage.lastTokens !== null && usage.lastTokens > 0 ? usage.lastTokens : (usage.totalTokens ?? 0);
    return { tokens: countOf(tokens), peak: countOf(tokens), window: usage.window === null ? null : countOf(usage.window), model: usage.model === null ? null : textOf(usage.model) };
}
