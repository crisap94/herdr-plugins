import type { Observed } from '#src/recap/domain/compaction.ts';
import { contextUsage, readRollout } from '@stateforge-labs/harness-adapters/codex';

export function codexObserved(lines: readonly string[]): Observed | null {
    const usage = contextUsage(readRollout(lines).rows);
    if (usage === null) {
        return null;
    }
    const tokens = usage.lastTokens !== null && usage.lastTokens > 0 ? usage.lastTokens : (usage.totalTokens ?? 0);
    return { tokens, peak: tokens, window: usage.window, model: usage.model };
}
