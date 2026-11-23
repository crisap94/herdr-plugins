import type { CompactAsk } from '#src/ports/requests.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Messages } from '#src/i18n/index.ts';
import { COMPACT_FAILURES } from '#src/protocol/exchanges/compact.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { LANE_CLOSED } from '#src/recap/domain/lane-closed.ts';
import type { ClosePoint } from '#src/recap/domain/lane-closed.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
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

export function laneBusyRefusal(messages: Messages, lane: Lane): Refusal {
    return { stage: 'failed', reason: COMPACT_FAILURES.laneBusy, why: LANE_BUSY_WHY, toast: must(parseText(messages.compaction.failed(String(lane.agent), LANE_BUSY_WHY))) };
}

export function laneClosedRefusal(point: ClosePoint): Refusal {
    return { stage: 'skipped', reason: COMPACT_FAILURES.skipped, why: must(parseText(LANE_CLOSED)), toast: null, closedAt: point };
}

interface ClaimSplit {
    readonly owned: Lane[];
    readonly held: Lane[];
}

export function splitByClaim(claims: Pick<LaneClaims, 'kindOf'>, lanes: readonly Lane[], claim: (lane: Lane) => Presence): ClaimSplit {
    const owned: Lane[] = [];
    const held: Lane[] = [];
    for (const lane of lanes) {
        if (claims.kindOf(String(lane.pane)) === 'handoff') {
            held.push(lane);
        } else if (claim(lane) === 'present') {
            owned.push(lane);
        }
    }
    return { owned, held };
}
