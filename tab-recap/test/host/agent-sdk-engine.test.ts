import { test } from 'node:test';
import type { Engine, LedgerEvent } from '@stateforge-labs/session-ledger';
import { restore, type EngineCall, type FakeEngine } from '@stateforge-labs/session-ledger/testkit';
import { hostCases } from 'agent-sdk-session-ledger/testkit';
import { pluginSubject } from '#test/conformance/subject.ts';

const recording = (engine: Engine): FakeEngine => {
    const log: EngineCall[] = [];
    const emitted: LedgerEvent[] = [];
    return {
        follow: (scope, session) => {
            log.push('follow');
            engine.follow(scope, session);
        },
        unfollow: (scope, key) => {
            log.push('unfollow');
            engine.unfollow(scope, key);
        },
        followedBy: (harness, session) => {
            log.push('followedBy');
            return engine.followedBy(harness, session);
        },
        turnEnded: (scope, key, cause) => {
            log.push('turnEnded');
            engine.turnEnded(scope, key, cause);
        },
        sessionStarted: (scope, key, now) => {
            log.push('sessionStarted');
            engine.sessionStarted(scope, key, now);
        },
        refresh: (scope) => {
            log.push('refresh');
            return engine.refresh(scope);
        },
        compacted: (scope, key) => {
            log.push('compacted');
            return engine.compacted(scope, key);
        },
        history: (scope, key) => {
            log.push('history');
            return engine.history(scope, key);
        },
        curate: (scope) => {
            log.push('curate');
            return engine.curate(scope);
        },
        restoreText: () => restore(''),
        emit: (event) => {
            emitted.push(event);
        },
        emitted: () => [...emitted],
        calls: () => [...log],
    };
};

const PENDING: Readonly<Record<string, string>> = {
    'H-1': 'owner: followedBy returns null after a follow; the package facade followedBy is a stub (packages/session-ledger/src/facade/followed-by.ts)',
    'H-5': 'owner: compacted returns no restore text on the default world, where the case expects the scripted text',
    'H-6': 'owner: compacted returns no restore text on the default world, where the case expects the scripted text',
    'H-15': 'owner: followedBy returns null after a follow; the package facade followedBy is a stub (packages/session-ledger/src/facade/followed-by.ts)',
};

for (const row of hostCases) {
    test(`${row.id} ${row.title}`, { todo: PENDING[row.id] ?? false }, async () => {
        const world = pluginSubject.world();
        await row.run(recording(pluginSubject.create(world)));
    });
}
