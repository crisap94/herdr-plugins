import type {
    Engine,
    FollowedSession,
    HarnessKind,
    LedgerEvent,
    RestoreText,
    ScopeId,
    SessionId,
    SessionKey,
} from '@stateforge-labs/session-ledger';
import { restore } from './ids.ts';

export type EngineCall = 'follow' | 'unfollow' | 'followedBy' | 'turnEnded' | 'sessionStarted' | 'refresh' | 'compacted' | 'history' | 'curate';

export interface FakeScript {
    readonly restore?: RestoreText;
}

export interface FakeEngine extends Engine {
    restoreText(): RestoreText;
    emit(event: LedgerEvent): void;
    emitted(): readonly LedgerEvent[];
    calls(): readonly EngineCall[];
}

interface Following {
    readonly scope: ScopeId;
    readonly session: FollowedSession;
}

const isFollow = (entry: Following, scope: ScopeId, key: SessionKey): boolean => entry.scope === scope && entry.session.key === key;

export function createFakeEngine(script: FakeScript = {}): FakeEngine {
    const scripted = script.restore ?? restore('restored');
    const log: EngineCall[] = [];
    const emitted: LedgerEvent[] = [];
    let follows: readonly Following[] = [];

    return {
        follow: (scope: ScopeId, session: FollowedSession) => {
            log.push('follow');
            follows = [...follows.filter((entry) => !isFollow(entry, scope, session.key)), { scope, session }];
        },
        unfollow: (scope: ScopeId, key: SessionKey) => {
            log.push('unfollow');
            follows = follows.filter((entry) => !isFollow(entry, scope, key));
        },
        followedBy: (harness: HarnessKind, session: SessionId) => {
            log.push('followedBy');
            const found = follows.find((entry) => entry.session.harness === harness && entry.session.session === session);
            return found === undefined ? null : { scope: found.scope, key: found.session.key };
        },
        turnEnded: () => {
            log.push('turnEnded');
        },
        sessionStarted: (scope: ScopeId, key: SessionKey, now: { readonly session: SessionId | null; readonly cwd: FollowedSession['cwd'] }) => {
            log.push('sessionStarted');
            follows = follows.map((entry) =>
                isFollow(entry, scope, key) ? { scope, session: { ...entry.session, session: now.session, cwd: now.cwd } } : entry,
            );
        },
        refresh: () => {
            log.push('refresh');
            return Promise.resolve();
        },
        compacted: () => {
            log.push('compacted');
            return scripted;
        },
        history: () => {
            log.push('history');
            return [];
        },
        curate: () => {
            log.push('curate');
            return Promise.resolve();
        },
        restoreText: () => scripted,
        emit: (event: LedgerEvent) => {
            emitted.push(event);
        },
        emitted: () => [...emitted],
        calls: () => [...log],
    };
}
