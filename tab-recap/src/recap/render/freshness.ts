import type { LastRunCause, NewerPrompts, RefreshStatus, Freshness } from '#src/recap/domain/freshness.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import { utcMinuteText } from './handoff-markdown.ts';

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

export function freshnessTextOf(freshness: Freshness): string {
    return [
        `last run: ${utcMinuteText(freshness.lastRun.at)}, ${CAUSE_WORDS[freshness.lastRun.cause]}`,
        statusWords(freshness.status),
        newerWords(freshness.newerPrompts),
        REFRESH_WORDS[freshness.refresh],
    ].join('\n');
}
