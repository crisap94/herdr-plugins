import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseNonEmptyText, type NonEmptyText } from '#src/recap/domain/text.ts';

export const EXPANDED_EVERY_MS: Count = must(parseCount(5000));
export const SETTLE_MS: Count = must(parseCount(3000));
export const TRAILING_SLACK_MS: Count = must(parseCount(25));
export const OPEN_MARKER_PREFIX: NonEmptyText = must(parseNonEmptyText('open.'));
export const OPEN_MARKER_FRESH_MS: Count = must(parseCount(60_000));
