import type { Observed } from '#src/recap/domain/compaction.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { contextUsage, readRollout } from '@stateforge-labs/harness-adapters/codex';
import { countOf } from '#src/recap/domain/count.ts';
import { textOf } from '#src/recap/domain/text.ts';

export { codexObserved } from './legacy.ts';

export function codexObservedOf(lines: readonly Text[]): Observed | null {
    const usage = contextUsage(readRollout(lines).rows);
    if (usage === null) {
        return null;
    }
    const tokens = usage.lastTokens !== null && usage.lastTokens > 0 ? usage.lastTokens : (usage.totalTokens ?? 0);
    return { tokens: countOf(tokens), peak: countOf(tokens), window: usage.window === null ? null : countOf(usage.window), model: usage.model === null ? null : textOf(usage.model) };
}
