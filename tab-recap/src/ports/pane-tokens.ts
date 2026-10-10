import type { Unknown } from './unknowable.ts';

export type PaneTokensResult = { readonly kind: 'tokens'; readonly tokens: Readonly<Record<string, string>> } | Unknown;

export interface PaneTokens {
    read(pane: string): Promise<PaneTokensResult>;
}
