import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Text } from '#src/recap/domain/text.ts';

export { SCREEN_PREFIX, isScreenSource } from '@stateforge-labs/session-ledger/unstable/ports/transcript-source.ts';

export type ScreenResult =
    | { readonly kind: 'screen'; readonly text: Text; readonly revision: Count; readonly truncated: Presence }
    | Unknown;

export interface Screens {
    readScreen(pane: PaneId, lines: Count): Promise<ScreenResult>;
}
