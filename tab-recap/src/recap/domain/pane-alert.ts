import type { Result } from '#src/protocol/result.ts';
import type { PaneId } from './ids.ts';
import type { ParseFailure } from './parse-failure.ts';
import { parseNonEmptyText } from './text.ts';
import type { NonEmptyText, Text } from './text.ts';
import type { Instant } from './time.ts';

export type AlertSource = NonEmptyText;

export interface PaneAlert {
    readonly source: AlertSource;
    readonly pane: PaneId;
    readonly label: Text;
    readonly at: Instant;
    readonly details: readonly Text[];
}

export function parseAlertSource(input: unknown): Result<AlertSource, ParseFailure> {
    return parseNonEmptyText(input);
}
