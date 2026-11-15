import type { ClosedLane } from './closures.ts';
import type { Lane } from './lane.ts';
import type { HiddenState, Shape } from './board.ts';
import type { PaneId, TabId } from './ids.ts';
import type { RecapCause } from './recap-cause.ts';
import type { Instant } from './time.ts';

export { RECAP_CAUSES } from './recap-cause.ts';
export type { RecapCause } from './recap-cause.ts';

export type Intent =
    | { readonly kind: 'open-column'; readonly tab: TabId; readonly shape: Shape }
    | { readonly kind: 'close-column'; readonly tab: TabId; readonly column: PaneId }
    | { readonly kind: 'recap'; readonly tab: TabId; readonly lanes: readonly Lane[]; readonly cause: RecapCause }
    | { readonly kind: 'publish'; readonly tab: TabId }
    | { readonly kind: 'read-prompt'; readonly lane: Lane }
    | { readonly kind: 'save-hidden'; readonly state: HiddenState }
    | { readonly kind: 'give-up'; readonly tab: TabId; readonly reopens: number }
    | { readonly kind: 'lane-closed'; readonly closed: ClosedLane }
    | { readonly kind: 'tab-gone'; readonly tab: TabId; readonly at: Instant };

export type IntentName = Intent['kind'];
