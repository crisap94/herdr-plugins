import type { AgentKind, SessionId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { HcTerminal } from './sdk-core.ts';

export function seenOfHcTerminal(terminal: HcTerminal, session: SessionId | null, agent: AgentKind): SeenLane {
    return {
        paneId: terminal.address,
        tabId: terminal.tab,
        workspaceId: terminal.workspace,
        agent,
        status: terminal.status,
        session,
        cwd: terminal.cwd,
        title: terminal.title,
    };
}
