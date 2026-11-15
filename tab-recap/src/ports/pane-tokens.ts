import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from './unknowable.ts';

export type PaneTokensResult = { readonly kind: 'tokens'; readonly tokens: ReadonlyMap<Text, Text> } | Unknown;

export interface PaneTokens {
    read(pane: PaneId): Promise<PaneTokensResult>;
}
