import type { Result } from '#src/protocol/result.ts';
import type { SessionKey } from './ids.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import type { NonEmptyText, Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export type AlertSource = NonEmptyText;

export interface PaneAlert {
    readonly source: AlertSource;
    readonly pane: SessionKey;
    readonly label: Text;
    readonly at: Instant;
    readonly details: readonly Text[];
}

export function parseAlertSource(input: unknown): Result<AlertSource, ParseFailure> {
    return parseNonEmptyText(input);
}
