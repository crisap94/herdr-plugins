import { createReceiver, type Followed } from '#src/adapters/hooks/receiver.ts';
import { startHookEndpoint } from '#src/adapters/hooks/endpoint.ts';
import { createTurnEnds } from '#src/adapters/hooks/turn-ends.ts';
import type { Running, SlotContext } from '#src/daemon/slots.ts';
import { must } from '#src/protocol/result.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { lanesOf } from '#src/recap/domain/board.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { SessionId } from '#src/recap/domain/ids.ts';
import type { HookHarness } from '#src/wire/hooks/contract.ts';
import { hooksSocketPath } from '#src/wire/paths.ts';

const followedOf = (board: Board, harness: HookHarness, session: SessionId): Followed | null => {
    for (const lane of board.lanes.values()) {
        if (lane.session === session && lane.agent === harness) {
            return { tab: lane.tab, pane: lane.pane, lane };
        }
    }
    return null;
};

export async function startHooks(context: SlotContext): Promise<Running> {
    const turnEnds = createTurnEnds(context.clock);
    const receiver = createReceiver({
        followed: (harness, session): Followed | null => followedOf(context.board(), harness, session),
        lanesOf: (tab) => lanesOf(context.board(), tab),
        observe: context.observe,
        recaps: context.recaps,
        engine: context.engine,
        turnEnds,
        preCompacts: context.preCompacts,
        claimIdle: context.claimIdle,
        restoreMode: () => (context.setting('TAB_RECAP_HOOKS_RESTORE') === 'off' ? 'off' : 'on'),
        clock: context.clock,
        log: context.log,
    });
    const unsubscribe = context.statuses((event) => {
        turnEnds.noteStatus(event, context.board());
    });
    try {
        const endpoint = await startHookEndpoint({
            socketPath: must(parseFsPath(hooksSocketPath(context.root))),
            receiver,
            log: context.log,
        });
        return {
            stop: async (): Promise<void> => {
                unsubscribe();
                await endpoint?.stop();
            },
        };
    } catch (error) {
        unsubscribe();
        throw error;
    }
}
