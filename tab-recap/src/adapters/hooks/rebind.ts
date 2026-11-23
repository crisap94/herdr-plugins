import { must } from '#src/protocol/result.ts';
import { parseLine, parseMessage, type Line } from '#src/daemon/slots.ts';
import type { FleetSnapshotResult } from '#src/ports/fleet-source.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { type SessionId, parsePaneId } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';
import type { HookHarness } from '#src/wire/hooks/contract.ts';

export type RebindMode = 'on' | 'off';

export interface RebindDeps {
    snapshot(): Promise<FleetSnapshotResult>;
    observe(observation: Observation): void;
    log(line: Line): void;
}

export interface Rebind {
    rebind(harness: HookHarness, session: SessionId): Promise<void>;
}

export function createRebind(deps: RebindDeps): Rebind {
    let last: Promise<void> = Promise.resolve();
    const once = async (harness: HookHarness, session: SessionId): Promise<void> => {
        try {
            const result = await deps.snapshot();
            if (result.kind !== 'snapshot') {
                return;
            }
            const wanted = textOf(session);
            const matches = result.seen.lanes.filter((lane) => lane.session === wanted && lane.agent === harness);
            const [match] = matches;
            if (match === undefined) {
                return;
            }
            if (matches.length > 1) {
                deps.log(parseLine(`hook rebind ${harness}: ${matches.length} panes report one session`));
                return;
            }
            deps.observe({ kind: 'session', pane: must(parsePaneId(match.paneId)), session: wanted });
            deps.log(parseLine(`hook rebind ${harness} ${match.paneId}`));
        } catch (error) {
            deps.log(parseLine(`hook rebind: ${parseMessage(error)}`));
        }
    };
    return {
        rebind: (harness: HookHarness, session: SessionId): Promise<void> => {
            last = last.then(() => once(harness, session));
            return last;
        },
    };
}
