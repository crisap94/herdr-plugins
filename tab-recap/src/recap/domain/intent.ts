import type { Lane } from './lane.ts';
import type { HiddenState, Shape } from './board.ts';
import type { PaneId, TabId } from './ids.ts';

export const RECAP_CAUSES = ['turn-ended', 'focused', 'requested'] as const;
export type RecapCause = typeof RECAP_CAUSES[number];

export type Intent =
    | { readonly kind: 'open-column'; readonly tab: TabId; readonly shape: Shape }
    | { readonly kind: 'close-column'; readonly tab: TabId; readonly column: PaneId }
    | { readonly kind: 'recap'; readonly tab: TabId; readonly lanes: readonly Lane[]; readonly cause: RecapCause }
    | { readonly kind: 'publish'; readonly tab: TabId }
    | { readonly kind: 'read-prompt'; readonly lane: Lane }
    | { readonly kind: 'save-hidden'; readonly state: HiddenState }
    | { readonly kind: 'give-up'; readonly tab: TabId; readonly reopens: number };

export type IntentName = Intent['kind'];
