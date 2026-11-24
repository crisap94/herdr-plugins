import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

export type PaneTokensResult = { readonly kind: 'tokens'; readonly tokens: ReadonlyMap<Text, Text> } | Unknown;

export interface PaneTokens {
    read(pane: SessionKey): Promise<PaneTokensResult>;
}
