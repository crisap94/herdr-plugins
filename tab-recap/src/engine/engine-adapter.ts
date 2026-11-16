import type { Directory as LedgerDirectory, Engine, FollowedSession, HarnessKind, HistoryFact, LedgerEvent, RecapCause, RecapWritten, RestoreText, ScopeId, SessionId as LedgerSessionId, SessionKey } from '@stateforge-labs/session-ledger';
import { createEngine, type Engine as LegacyEngine, type EnginePlugs as LegacyPlugs } from '#src/recap/application/engine.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseAgentKind, parsePaneId, parseSessionId, parseTabId, parseWorkspaceId, workspaceOfTab, type AgentKind, type PaneId, type SessionId, type TabId, type WorkspaceId } from '#src/recap/domain/ids.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { RECAP_CAUSES } from '#src/recap/domain/recap-cause.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export interface PluginEnginePlugs extends Omit<LegacyPlugs, 'ran'> {
    on?(event: LedgerEvent): void;
}

const isScope = (tab: TabId): tab is TabId & ScopeId => tab.trim() !== '';
const isKey = (pane: PaneId): pane is PaneId & SessionKey => pane.trim() !== '';
const isHarness = (agent: AgentKind): agent is AgentKind & HarnessKind => agent.trim() !== '';
const isLedgerSession = (session: SessionId): session is SessionId & LedgerSessionId => session.trim() !== '';
const isLedgerDirectory = (cwd: Directory): cwd is Directory & LedgerDirectory => cwd.trim() !== '';
const isRestore = (text: Text): text is Text & RestoreText => text.length >= 0;

export const scopeOf = (tab: TabId): ScopeId | null => (isScope(tab) ? tab : null);
export const keyOf = (pane: PaneId): SessionKey | null => (isKey(pane) ? pane : null);
const harnessOf = (agent: AgentKind): HarnessKind | null => (isHarness(agent) ? agent : null);
export const ledgerSessionOf = (session: SessionId): LedgerSessionId | null => (isLedgerSession(session) ? session : null);
export const ledgerDirectoryOf = (cwd: Directory): LedgerDirectory | null => (isLedgerDirectory(cwd) ? cwd : null);

const tabOf = (scope: ScopeId): TabId | null => {
    const read = parseTabId(scope);
    return read.kind === 'ok' ? read.value : null;
};
const paneOf = (key: SessionKey): PaneId | null => {
    const read = parsePaneId(key);
    return read.kind === 'ok' ? read.value : null;
};
const agentOf = (harness: HarnessKind): AgentKind | null => {
    const read = parseAgentKind(harness);
    return read.kind === 'ok' ? read.value : null;
};
const sessionOf = (session: LedgerSessionId): SessionId | null => {
    const read = parseSessionId(session);
    return read.kind === 'ok' ? read.value : null;
};
const cwdOf = (cwd: LedgerDirectory): Directory | null => {
    const read = parseDirectory(cwd);
    return read.kind === 'ok' ? read.value : null;
};
const workspaceOf = (tab: TabId): WorkspaceId | null => {
    const read = parseWorkspaceId(tab);
    return workspaceOfTab(tab) ?? (read.kind === 'ok' ? read.value : null);
};

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

const laneOf = (scope: ScopeId, session: FollowedSession): Lane | null => {
    const tab = tabOf(scope);
    const pane = paneOf(session.key);
    const agent = agentOf(session.harness);
    const workspace = tab === null ? null : workspaceOf(tab);
    if (tab === null || pane === null || agent === null || workspace === null) {
        return null;
    }
    return {
        pane,
        tab,
        workspace,
        agent,
        status: laneStatus(null),
        session: session.session === null ? null : sessionOf(session.session),
        cwd: session.cwd === null ? null : cwdOf(session.cwd),
        title: session.title,
        since: null,
    };
};

const writtenOf = (event: RunEvent): RecapWritten | null => {
    const tab = parseTabId(event.tab);
    const scope = tab.kind === 'ok' ? scopeOf(tab.value) : null;
    if (scope === null) {
        return null;
    }
    const cause = RECAP_CAUSES.find((candidate) => candidate === event.cause);
    return { kind: 'recap-written', scope, turns: event.turns, boundary: event.boundary, ...(cause === undefined ? {} : { cause }) };
};

const emptyRestore = (): RestoreText => {
    const text = must(parseText(''));
    if (isRestore(text)) {
        return text;
    }
    throw new Error('the empty text is always a restore text');
};

const reportWritten = (plugs: PluginEnginePlugs) => (event: RunEvent): void => {
    const written = writtenOf(event);
    if (written === null) {
        plugs.environment.log(`engine-adapter: recap-written skipped, the tab id is empty: ${event.tab}`);
        return;
    }
    plugs.on?.(written);
};

const legacyOf = (plugs: PluginEnginePlugs): LegacyEngine => createEngine({
    source: plugs.source,
    store: plugs.store,
    models: plugs.models,
    environment: plugs.environment,
    settings: plugs.settings,
    ran: reportWritten(plugs),
});

export function pluginEngine(plugs: PluginEnginePlugs): Engine {
    const followed = new Map<ScopeId, Map<SessionKey, Lane>>();
    const seen = new Map<ScopeId, Map<SessionKey, Lane>>();
    const lanesOf = (scope: ScopeId): readonly Lane[] => [...(followed.get(scope)?.values() ?? [])];
    const legacy = legacyOf(plugs);
    return {
        follow: (scope: ScopeId, session: FollowedSession): void => {
            const lane = laneOf(scope, session);
            if (lane === null) {
                plugs.environment.log(`engine-adapter: follow skipped, an id is empty: ${scope} ${session.key}`);
                return;
            }
            const lanes = followed.get(scope) ?? new Map<SessionKey, Lane>();
            lanes.set(session.key, lane);
            followed.set(scope, lanes);
            const remembered = seen.get(scope) ?? new Map<SessionKey, Lane>();
            remembered.set(session.key, lane);
            seen.set(scope, remembered);
        },
        unfollow: (scope: ScopeId, key: SessionKey): void => {
            followed.get(scope)?.delete(key);
        },
        followedBy: (): null => null,
        turnEnded: (scope: ScopeId, key: SessionKey | null, cause: RecapCause): void => {
            const tab = tabOf(scope);
            if (tab === null) {
                return;
            }
            if (key !== null && followed.get(scope)?.has(key) !== true) {
                plugs.environment.log(`engine-adapter: turn ended for a session that is not followed: ${scope} ${key}`);
                return;
            }
            legacy.turnEnded(tab, lanesOf(scope), cause);
        },
        sessionStarted: (): void => undefined,
        refresh: (scope: ScopeId): Promise<void> => {
            const tab = tabOf(scope);
            return tab === null ? Promise.resolve() : legacy.refresh(tab, lanesOf(scope));
        },
        compacted: (scope: ScopeId): RestoreText => {
            const tab = tabOf(scope);
            if (tab !== null) {
                void legacy.refresh(tab, lanesOf(scope));
            }
            return emptyRestore();
        },
        history: (scope: ScopeId, key: SessionKey): readonly HistoryFact[] => {
            const tab = tabOf(scope);
            const lane = seen.get(scope)?.get(key);
            if (tab === null || lane === undefined) {
                plugs.environment.log(`engine-adapter: history skipped, the session was never followed: ${scope} ${key}`);
                return [];
            }
            return legacy.history(tab, lane);
        },
        curate: (): Promise<void> => Promise.resolve(),
    };
}
