import type { SessionKey } from './lane-shape.ts';
import type { Text } from './text.ts';

export interface RecapSections { readonly goal: Text; readonly now: readonly Text[]; readonly needs: readonly Text[]; readonly done: readonly Text[]; readonly decisions: readonly Text[]; readonly next: readonly Text[]; readonly links: readonly Text[]; readonly rules: readonly Text[]; }

export interface RecapTask { readonly id: Text; readonly name: Text; readonly sessions: readonly SessionKey[]; readonly sections: RecapSections | null; readonly markdown: Text; }
