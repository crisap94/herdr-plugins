import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export const DEFAULT_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;
const DEFAULT_TAB_KEEP = must(parseCount(DEFAULT_KEEP_DAYS));

export type ClosedLaneDays = Brand<number, 'ClosedLaneDays'>;

export type RetentionWindow = 'inside' | 'outside';

export const CLOSED_LANE_DAYS_MAX_DIGITS = 9;

const WHOLE_DAYS = new RegExp(`^[0-9]{1,${CLOSED_LANE_DAYS_MAX_DIGITS}}$`);

export function parseClosedLaneDays(input: unknown): Result<ClosedLaneDays, ParseFailure> {
    const text = parseText(input);
    if (text.kind === 'err') {
        return text;
    }
    const digits = text.value.trim();
    if (!WHOLE_DAYS.test(digits)) {
        return err({ kind: 'not-an-integer' });
    }
    return ok(brand<number, 'ClosedLaneDays'>(Number(digits)));
}

export const DEFAULT_CLOSED_LANE_DAYS = must(parseClosedLaneDays('14'));

export function closedLaneDaysOrDefault(parsed: Result<ClosedLaneDays, ParseFailure>): ClosedLaneDays {
    return parsed.kind === 'ok' ? parsed.value : DEFAULT_CLOSED_LANE_DAYS;
}

export function tabKeepCountOf(raw: Text | undefined): Count {
    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_TAB_KEEP;
    }
    const parsed = parseCount(Number(raw));
    return parsed.kind === 'ok' ? parsed.value : DEFAULT_TAB_KEEP;
}

export function inWindow(closedAt: Instant, now: Instant, days: ClosedLaneDays): RetentionWindow {
    return days !== 0 && closedAt >= now - days * DAY_MS ? 'inside' : 'outside';
}

export function cutoffAt(now: Instant, days: Count): Instant | null {
    return days === 0 ? null : instant(now - days * DAY_MS);
}

export const closedCutoffOf = (now: Instant, days: ClosedLaneDays): Instant | null => (days === 0 ? null : instant(now - days * DAY_MS));
