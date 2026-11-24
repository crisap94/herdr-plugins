import type { Result } from '@stateforge-labs/session-ledger';
import type { SessionKey } from './ids.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger';
import type { NonEmptyText, Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';

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
