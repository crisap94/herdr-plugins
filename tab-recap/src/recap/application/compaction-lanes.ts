import type { CompactRequest } from '#src/ports/requests.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Messages } from '#src/i18n/index.ts';
import { COMPACT_FAILURES } from '#src/protocol/exchanges/compact.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import type { LaneClaims } from './lane-claims.ts';

export interface Refusal {
    readonly stage: 'skipped' | 'failed';
    readonly reason: CompactFailure;
    readonly why: string;
    readonly toast: string;
}

export interface Asked {
    readonly origin: Origin;
    readonly request: CompactRequest | null;
}

const LANE_BUSY_WHY = 'lane busy';

export function laneBusyRefusal(messages: Messages, lane: Lane): Refusal {
    return { stage: 'failed', reason: COMPACT_FAILURES.laneBusy, why: LANE_BUSY_WHY, toast: messages.compaction.failed(String(lane.agent), LANE_BUSY_WHY) };
}

export function splitByClaim(claims: Pick<LaneClaims, 'kindOf'>, lanes: readonly Lane[], claim: (lane: Lane) => boolean): { readonly owned: Lane[]; readonly held: Lane[] } {
    const owned: Lane[] = [];
    const held: Lane[] = [];
    for (const lane of lanes) {
        if (claims.kindOf(String(lane.pane)) === 'handoff') {
            held.push(lane);
        } else if (claim(lane)) {
            owned.push(lane);
        }
    }
    return { owned, held };
}
