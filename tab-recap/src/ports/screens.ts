import type { Unknown } from '@stateforge-labs/session-ledger';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Count } from '@stateforge-labs/session-ledger';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Text } from '@stateforge-labs/session-ledger';

export { SCREEN_PREFIX, isScreenSource } from '@stateforge-labs/session-ledger';

export type ScreenOutcome =
    | { readonly kind: 'screen'; readonly text: Text; readonly revision: Count; readonly truncated: Presence }
    | Unknown;

export interface ScreenReader {
    readScreen(pane: SessionKey, lines: Count): Promise<ScreenOutcome>;
}
