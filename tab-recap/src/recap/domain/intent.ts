import type { ClosedLane } from './closures.ts';
import type { Lane } from './lane.ts';
import type { HiddenState, Shape } from './board.ts';
import type { Count } from './count.ts';
import type { SessionKey, ScopeId } from './ids.ts';
import type { RecapCause } from '@stateforge-labs/session-ledger/unstable/recap/domain/recap-cause.ts';
import type { Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

export { RECAP_CAUSES } from '@stateforge-labs/session-ledger/unstable/recap/domain/recap-cause.ts';
export type { RecapCause } from '@stateforge-labs/session-ledger/unstable/recap/domain/recap-cause.ts';

export type Intent =
    | { readonly kind: 'open-column'; readonly tab: ScopeId; readonly shape: Shape }
    | { readonly kind: 'close-column'; readonly tab: ScopeId; readonly column: SessionKey }
    | { readonly kind: 'recap'; readonly tab: ScopeId; readonly lanes: readonly Lane[]; readonly cause: RecapCause }
    | { readonly kind: 'publish'; readonly tab: ScopeId }
    | { readonly kind: 'read-prompt'; readonly lane: Lane }
    | { readonly kind: 'save-hidden'; readonly state: HiddenState }
    | { readonly kind: 'give-up'; readonly tab: ScopeId; readonly reopens: Count }
    | { readonly kind: 'lane-closed'; readonly closed: ClosedLane }
    | { readonly kind: 'tab-gone'; readonly tab: ScopeId; readonly at: Instant };

export type IntentName = Intent['kind'];
