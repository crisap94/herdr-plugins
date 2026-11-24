import type { Locale } from '#src/i18n/messages.ts';
import type { TabLaneRecord } from '#src/ports/tab-views.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

export const DEFAULT_MARK = '⚑';

export interface PaneNote {
    readonly label: Text;
    readonly at: Instant | null;
    readonly details: readonly Text[];
    readonly mark?: Text;
}

export interface PaneNotes {
    readonly kind: 'notes';
    readonly byPane: ReadonlyMap<SessionKey, readonly PaneNote[]>;
}

export type PaneNotesResult = PaneNotes | Unknown;

export interface ExtensionPort {
    readonly id: Text;
    notes?(lanes?: readonly TabLaneRecord[], locale?: Locale): PaneNotesResult;
    warning?(locale: Locale): Text | null;
}
