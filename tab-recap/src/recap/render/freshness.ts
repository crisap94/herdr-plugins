import { must } from '#src/protocol/result.ts';
import type { Brand } from '#src/recap/domain/brand.ts';
import type { LastRunCause, NewerPrompts, RefreshStatus, Freshness } from '#src/recap/domain/freshness.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import { utcMinuteText } from '#src/recap/render/utc-minute.ts';

export type FreshnessBlock = Brand<string, 'FreshnessBlock'>;

const CAUSE_WORDS: Readonly<Record<LastRunCause, string>> = {
    'turn-ended': 'after a turn',
    focused: 'when the lane was focused',
    requested: 'on request',
    imported: 'imported',
};

const REFRESH_WORDS: Readonly<Record<RefreshStatus, string>> = {
    'not-requested': 'refresh not requested',
    refreshed: 'refreshed',
    failed: 'refresh failed',
    'timed-out': 'refresh timed out',
};

const newerWords = (newer: NewerPrompts): string => {
    switch (newer.kind) {
        case 'none':
            return 'newer prompts: none';
        case 'at-least':
            return `newer prompts: at least ${newer.count}`;
        case 'unknown':
            return 'newer prompts: unknown';
        default: {
            const exhaustive: never = newer;
            return exhaustive;
        }
    }
};

const statusWords = (status: LaneStatus): string => `lane status: ${status}`;

const closedWords = (closedAt: Instant): Text => must(parseText(`closed at ${new Date(closedAt).toISOString()}`));

export function freshnessTextOf(freshness: Freshness, closedAt: Instant | null = null): FreshnessBlock {
    return [
        `last run: ${utcMinuteText(freshness.lastRun.at)}, ${CAUSE_WORDS[freshness.lastRun.cause]}`,
        closedAt === null ? statusWords(freshness.status) : closedWords(closedAt),
        newerWords(freshness.newerPrompts),
        REFRESH_WORDS[freshness.refresh],
    ].join('\n') as FreshnessBlock;
}
