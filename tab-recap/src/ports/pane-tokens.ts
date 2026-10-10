// What the pane's tokens say right now (herdr's `pane.get`): every source's names, merged. Read for the typing lease, the in-flight gate and the notes.
import type { Unknown } from './unknowable.ts';

export type PaneTokensResult = { readonly kind: 'tokens'; readonly tokens: Readonly<Record<string, string>> } | Unknown;

export interface PaneTokens {
    read(pane: string): Promise<PaneTokensResult>;
}
