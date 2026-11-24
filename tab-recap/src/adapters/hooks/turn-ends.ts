import type { StatusEvent } from '#src/daemon/slots.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import { endsTurn } from '#src/recap/domain/status.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { STATUS_COVERS_MS } from '#src/wire/hooks/turn-signal.ts';

export interface TurnEnds {
    noteStatus(event: StatusEvent, board: Board): void;
    endedAt(pane: SessionKey): Instant | null;
}

export function createTurnEnds(clock: Clock): TurnEnds {
    const ended = new Map<SessionKey, Instant>();

    const expire = (now: Instant): void => {
        for (const [pane, at] of ended) {
            if (now - at > STATUS_COVERS_MS) {
                ended.delete(pane);
            }
        }
    };

    return {
        noteStatus: (event, board): void => {
            const now = clock.now();
            expire(now);
            if (board.lanes.get(event.pane)?.status === 'working' && endsTurn('working', event.status) === 'present') {
                ended.set(event.pane, now);
            }
        },
        endedAt: (pane): Instant | null => ended.get(pane) ?? null,
    };
}
