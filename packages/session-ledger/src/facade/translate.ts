import { parseScopeId, parseSessionKey, parseHarnessKind, parseSessionId as parseLedgerSessionId, parseDirectory as parseLedgerDirectory, type Directory as LedgerDirectory, type HarnessKind, type RestoreText, type ScopeId, type SessionId as LedgerSessionId, type SessionKey } from '#src/contract/ids.ts';
import type { FollowedSession, RecapCause } from '#src/contract/session.ts';
import type { RecapWritten } from '#src/contract/events.ts';
import type { HistoryFact } from '#src/contract/facts.ts';
import { instant } from '#src/contract/kernel.ts';
import type { HistoryFact as LegacyHistoryFact } from '#src/ports/ledger.ts';
import { isClosedWhy, isSection } from '#src/recap/domain/fact.ts';
import type { RunEvent } from '#src/recap/application/ledger-reconcile.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import type { AgentKind, Lane, PaneId, SessionId, TabId, WorkspaceId } from '#src/recap/domain/lane-shape.ts';
import { RECAP_CAUSES } from '#src/recap/domain/recap-cause.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { must, type Result } from '#src/protocol/result.ts';

const valueOf = <T>(read: Result<T, ParseFailure>): T | null => (read.kind === 'ok' ? read.value : null);

const innerText = (raw: ScopeId | SessionKey | HarnessKind | LedgerSessionId | TabId): NonEmptyText | null => valueOf(parseNonEmptyText(raw));

export const tabOf = (scope: ScopeId): TabId | null => {
    const text = innerText(scope);
    return text === null ? null : brand<string, 'TabId'>(text);
};

const paneOf = (key: SessionKey): PaneId | null => {
    const text = innerText(key);
    return text === null ? null : brand<string, 'PaneId'>(text);
};

const agentOf = (harness: HarnessKind): AgentKind | null => {
    const text = innerText(harness);
    return text === null ? null : brand<string, 'AgentKind'>(text);
};

const sessionOf = (session: LedgerSessionId): SessionId | null => {
    const text = innerText(session);
    return text === null ? null : brand<string, 'SessionId'>(text);
};

const cwdOf = (cwd: LedgerDirectory): Directory | null => valueOf(parseDirectory(cwd));

const workspaceOf = (tab: TabId): WorkspaceId | null => {
    const colon = tab.indexOf(':');
    if (colon === -1 || tab.slice(0, colon).trim() === '' || tab.slice(colon + 1).trim() === '') {
        const text = innerText(tab);
        return text === null ? null : brand<string, 'WorkspaceId'>(text);
    }
    return brand<string, 'WorkspaceId'>(tab.slice(0, colon));
};

export const laneOf = (scope: ScopeId, session: FollowedSession): Lane | null => {
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
        status: 'unknown',
        session: session.session === null ? null : sessionOf(session.session),
        cwd: session.cwd === null ? null : cwdOf(session.cwd),
        title: session.title,
        since: null,
    };
};

export const followedOf = (lane: Lane): FollowedSession | null => {
    const key = valueOf(parseSessionKey(lane.pane));
    const harness = valueOf(parseHarnessKind(lane.agent));
    if (key === null || harness === null) {
        return null;
    }
    return {
        key,
        harness,
        session: lane.session === null ? null : valueOf(parseLedgerSessionId(lane.session)),
        cwd: lane.cwd === null ? null : valueOf(parseLedgerDirectory(lane.cwd)),
        title: valueOf(parseText(lane.title)),
    };
};

export const historyOf = (facts: readonly LegacyHistoryFact[]): readonly HistoryFact[] =>
    facts.flatMap((fact) => {
        const { section, closedWhy } = fact;
        if (!isSection(section)) {
            return [];
        }
        return [{
            section,
            text: brand<string, 'Text'>(fact.text),
            why: fact.why === null ? null : brand<string, 'Text'>(fact.why),
            state: fact.state,
            closedWhy: closedWhy !== null && isClosedWhy(closedWhy) ? closedWhy : null,
            closedAt: fact.closedAt === null ? null : instant(fact.closedAt),
            firstAt: instant(fact.firstAt),
            lastAt: instant(fact.lastAt),
        }];
    });

export const writtenOf = (event: RunEvent): RecapWritten | null => {
    const scope = valueOf(parseScopeId(event.tab));
    if (scope === null) {
        return null;
    }
    const cause: RecapCause | undefined = RECAP_CAUSES.find((candidate) => candidate === event.cause);
    return { kind: 'recap-written', scope, turns: brand<number, 'Count'>(event.turns), boundary: brand<boolean, 'Boundary'>(event.boundary), ...(cause === undefined ? {} : { cause }) };
};

const isRestore = (text: Text | RestoreText): text is RestoreText => text.length >= 0;

export const emptyRestore = (): RestoreText => {
    const text = must(parseText(''));
    if (isRestore(text)) {
        return text;
    }
    throw new Error('the empty text is always a restore text');
};
