import type { CompactAsk } from '#src/ports/requests.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Messages } from '#src/i18n/index.ts';
import { COMPACT_FAILURES } from '#src/protocol/exchanges/compact.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { LANE_CLOSED } from '#src/recap/domain/lane-closed.ts';
import type { ClosePoint } from '#src/recap/domain/lane-closed.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { type Presence } from '#src/recap/domain/presence.ts';
import type { LaneClaims } from './lane-claims.ts';

export interface Refusal {
    readonly stage: 'skipped' | 'failed';
    readonly reason: CompactFailure;
    readonly why: Text;
    readonly toast: Text | null;
    readonly closedAt?: ClosePoint;
}

export interface Asked {
    readonly origin: Origin;
    readonly request: CompactAsk | null;
}

const LANE_BUSY_WHY = must(parseText('lane busy'));

export function laneBusyRefusal(messages: Messages, lane: FollowedSession): Refusal {
    return { stage: 'failed', reason: COMPACT_FAILURES.laneBusy, why: LANE_BUSY_WHY, toast: must(parseText(messages.compaction.failed(must(parseText(lane.agent)), LANE_BUSY_WHY))) };
}

export function laneClosedRefusal(point: ClosePoint): Refusal {
    return { stage: 'skipped', reason: COMPACT_FAILURES.skipped, why: must(parseText(LANE_CLOSED)), toast: null, closedAt: point };
}

interface ClaimSplit {
    readonly owned: FollowedSession[];
    readonly held: FollowedSession[];
}

export function splitByClaim(claims: Pick<LaneClaims, 'kindOf'>, lanes: readonly FollowedSession[], claim: (lane: FollowedSession) => Presence): ClaimSplit {
    const owned: FollowedSession[] = [];
    const held: FollowedSession[] = [];
    for (const lane of lanes) {
        if (claims.kindOf(lane.pane) === 'handoff') {
            held.push(lane);
        } else if (claim(lane) === 'present') {
            owned.push(lane);
        }
    }
    return { owned, held };
}
