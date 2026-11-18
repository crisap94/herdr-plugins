import { parseDirectory, parseHarnessKind, parseScopeId, parseSessionId, parseSessionKey, type Directory as LedgerDirectory, type Engine, type FollowedSession, type HarnessKind, type ScopeId, type SessionId as LedgerSessionId, type SessionKey } from '@stateforge-labs/session-ledger';
import { engineOver, type FacadePlugs } from '@stateforge-labs/session-ledger/unstable/facade/create-engine.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { ParseFailure, Result } from '@stateforge-labs/session-ledger';
import type { AgentKind, PaneId, SessionId, TabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

export type PluginEnginePlugs = FacadePlugs;

const valueOf = <T>(read: Result<T, ParseFailure>): T | null => (read.kind === 'ok' ? read.value : null);

export const scopeOf = (tab: TabId): ScopeId | null => valueOf(parseScopeId(tab));
export const keyOf = (pane: PaneId): SessionKey | null => valueOf(parseSessionKey(pane));
const harnessOf = (agent: AgentKind): HarnessKind | null => valueOf(parseHarnessKind(agent));
export const ledgerSessionOf = (session: SessionId): LedgerSessionId | null => valueOf(parseSessionId(session));
export const ledgerDirectoryOf = (cwd: Directory): LedgerDirectory | null => valueOf(parseDirectory(cwd));

export const followedOf = (lane: Lane): FollowedSession | null => {
    const key = keyOf(lane.pane);
    const harness = harnessOf(lane.agent);
    if (key === null || harness === null) {
        return null;
    }
    return {
        key,
        harness,
        session: lane.session === null ? null : ledgerSessionOf(lane.session),
        cwd: lane.cwd === null ? null : ledgerDirectoryOf(lane.cwd),
        title: lane.title,
    };
};

export function pluginEngine(plugs: PluginEnginePlugs): Engine {
    return engineOver(plugs);
}
