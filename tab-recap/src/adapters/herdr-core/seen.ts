import { textOf } from '@stateforge-labs/session-ledger';
import type { HarnessKind, SessionId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { HcTerminal } from './sdk-core.ts';

export function seenOfHcTerminal(terminal: HcTerminal, session: SessionId | null, agent: HarnessKind): SeenLane {
    return {
        paneId: textOf(terminal.address),
        tabId: textOf(terminal.tab),
        workspaceId: textOf(terminal.workspace),
        agent: textOf(agent),
        status: textOf(terminal.status),
        session: session === null ? null : textOf(session),
        cwd: terminal.cwd === null ? null : textOf(terminal.cwd),
        title: terminal.title === null ? null : textOf(terminal.title),
    };
}
