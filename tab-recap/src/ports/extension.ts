import type { Locale } from '#src/i18n/messages.ts';
import type { TabLaneRecord } from '#src/ports/tab-views.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export const DEFAULT_MARK = '⚑';

export interface PaneNote {
    readonly label: Text;
    readonly at: Instant | null;
    readonly details: readonly Text[];
    readonly mark?: Text;
}

export interface PaneNotes {
    readonly kind: 'notes';
    readonly byPane: ReadonlyMap<PaneId, readonly PaneNote[]>;
}

export type PaneNotesResult = PaneNotes | Unknown;

export interface ExtensionPort {
    readonly id: Text;
    notes?(lanes?: readonly TabLaneRecord[], locale?: Locale): PaneNotesResult;
    warning?(locale: Locale): Text | null;
}
