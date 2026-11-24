import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type PaneTokensResult = { readonly kind: 'tokens'; readonly tokens: ReadonlyMap<Text, Text> } | Unknown;

export interface PaneTokens {
    read(pane: SessionKey): Promise<PaneTokensResult>;
}
