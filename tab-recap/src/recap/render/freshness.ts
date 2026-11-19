import { must } from '#src/protocol/result.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { LastRunCause, NewerPrompts, RefreshStatus, Freshness } from '#src/recap/domain/freshness.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import { utcMinuteOf } from '#src/recap/render/utc-minute.ts';

export type FreshnessBlock = Brand<string, 'FreshnessBlock'>;

const parseFreshnessBlock = (composed: Text): FreshnessBlock => brand<string, 'FreshnessBlock'>(composed);

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

const newerWords = (newer: NewerPrompts): Text => {
    switch (newer.kind) {
        case 'none':
            return must(parseText('newer prompts: none'));
        case 'at-least':
            return must(parseText(`newer prompts: at least ${newer.count}`));
        case 'unknown':
            return must(parseText('newer prompts: unknown'));
        default: {
            const exhaustive: never = newer;
            return exhaustive;
        }
    }
};

const statusWords = (status: LaneStatus): Text => must(parseText(`lane status: ${status}`));

const closedWords = (closedAt: Instant): Text => must(parseText(`closed at ${utcMinuteOf(closedAt)}`));

export function freshnessTextOf(freshness: Freshness, closedAt: Instant | null = null): FreshnessBlock {
    return parseFreshnessBlock(must(parseText([
        `last run: ${utcMinuteOf(instant(freshness.lastRun.at))}, ${CAUSE_WORDS[freshness.lastRun.cause]}`,
        closedAt === null ? statusWords(freshness.status) : closedWords(closedAt),
        newerWords(freshness.newerPrompts),
        REFRESH_WORDS[freshness.refresh],
    ].join('\n'))));
}
