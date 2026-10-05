import type { Lane } from './lane.ts';
import type { HiddenState, Shape } from './board.ts';
import type { PaneId, TabId } from './ids.ts';

export type RecapCause = 'turn-ended' | 'focused' | 'requested';

export type Intent =
    | { readonly kind: 'open-column'; readonly tab: TabId; readonly shape: Shape }
    | { readonly kind: 'close-column'; readonly tab: TabId; readonly column: PaneId }
    /** one recap per TAB, written from every lane in it */
    | { readonly kind: 'recap'; readonly tab: TabId; readonly lanes: readonly Lane[]; readonly cause: RecapCause }
    | { readonly kind: 'publish'; readonly tab: TabId }
    /** a lane's status changed or it is new: read the newest thing the operator typed to it (the live prompt) */
    | { readonly kind: 'read-prompt'; readonly lane: Lane }
    /** the operator's hidden columns changed: keep them across restarts */
    | { readonly kind: 'save-hidden'; readonly state: HiddenState }
    | { readonly kind: 'give-up'; readonly tab: TabId; readonly reopens: number };

export type IntentName = Intent['kind'];
