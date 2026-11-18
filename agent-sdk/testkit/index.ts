import { deepEqual, equal } from 'node:assert/strict';
import { createFakeEngine, harness, restore, scope, session, type FakeEngine } from '@stateforge-labs/session-ledger/testkit';
import {
    createSessionLedger,
    mergeHooks,
    type HookEventName,
    type HookInput,
    type HookOutput,
    type SessionLedger,
} from '../src/index.ts';

export interface HostCase {
    readonly id: string;
    readonly title: string;
    run(engine: FakeEngine): Promise<void>;
}

const start = (source: string, sessionId = 's1'): HookInput => ({ hook_event_name: 'SessionStart', session_id: sessionId, cwd: '/work', source });

const hook = (event: HookEventName, sessionId = 's1'): HookInput => ({ hook_event_name: event, session_id: sessionId, cwd: '/work' });

async function fire(ledger: SessionLedger, event: HookEventName, input: HookInput): Promise<HookOutput[]> {
    const outputs: HookOutput[] = [];
    for (const matcher of ledger.hooks[event] ?? []) {
        for (const callback of matcher.hooks) {
            outputs.push(await callback(input));
        }
    }
    return outputs;
}

const RESTORED = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'restored' } };

export const hostCases: readonly HostCase[] = [
    {
        id: 'H-1',
        title: 'the first SessionStart follows the session and records its start',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            await fire(ledger, 'SessionStart', start('startup'));
            deepEqual(engine.calls(), ['follow', 'sessionStarted']);
            deepEqual(engine.followedBy(harness('claude'), session('s1')), { scope: scope('agent-sdk:s1'), key: 's1' });
        },
    },
    {
        id: 'H-2',
        title: 'a SessionStart from a fresh start returns no context',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            deepEqual(await fire(ledger, 'SessionStart', start('startup')), [{}]);
            deepEqual(engine.calls(), ['follow', 'sessionStarted']);
        },
    },
    {
        id: 'H-3',
        title: 'Stop ends the turn',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            deepEqual(await fire(ledger, 'Stop', hook('Stop')), [{}]);
            deepEqual(engine.calls(), ['follow', 'turnEnded']);
        },
    },
    {
        id: 'H-4',
        title: 'PostCompact ends the turn',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            deepEqual(await fire(ledger, 'PostCompact', hook('PostCompact')), [{}]);
            deepEqual(engine.calls(), ['follow', 'turnEnded']);
        },
    },
    {
        id: 'H-5',
        title: 'a compact SessionStart returns the restore text as context',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            deepEqual(await fire(ledger, 'SessionStart', start('compact')), [RESTORED]);
            deepEqual(engine.calls(), ['follow', 'sessionStarted', 'compacted']);
        },
    },
    {
        id: 'H-6',
        title: 'a resume SessionStart returns the restore text as context',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            deepEqual(await fire(ledger, 'SessionStart', start('resume')), [RESTORED]);
            deepEqual(engine.calls(), ['follow', 'sessionStarted', 'compacted']);
        },
    },
    {
        id: 'H-7',
        title: 'an empty restore text returns no context',
        run: async () => {
            const engine = createFakeEngine({ restore: restore('') });
            const ledger = createSessionLedger(engine);
            deepEqual(await fire(ledger, 'SessionStart', start('compact')), [{}]);
            deepEqual(engine.calls(), ['follow', 'sessionStarted', 'compacted']);
        },
    },
    {
        id: 'H-8',
        title: 'SessionEnd unfollows the session',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            await fire(ledger, 'SessionStart', start('startup'));
            deepEqual(await fire(ledger, 'SessionEnd', hook('SessionEnd')), [{}]);
            deepEqual(engine.calls(), ['follow', 'sessionStarted', 'unfollow']);
            equal(engine.followedBy(harness('claude'), session('s1')), null);
        },
    },
    {
        id: 'H-9',
        title: 'a session is followed once however many events it sends',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            await fire(ledger, 'Stop', hook('Stop'));
            await fire(ledger, 'Stop', hook('Stop'));
            deepEqual(engine.calls(), ['follow', 'turnEnded', 'turnEnded']);
        },
    },
    {
        id: 'H-10',
        title: 'settled refreshes every followed scope',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            await fire(ledger, 'Stop', hook('Stop', 's1'));
            await fire(ledger, 'Stop', hook('Stop', 's2'));
            await ledger.settled();
            deepEqual(engine.calls(), ['follow', 'turnEnded', 'follow', 'turnEnded', 'refresh', 'refresh']);
        },
    },
    {
        id: 'H-11',
        title: 'close unfollows every followed key',
        run: async (engine) => {
            const ledger = createSessionLedger(engine);
            await fire(ledger, 'Stop', hook('Stop', 's1'));
            await fire(ledger, 'Stop', hook('Stop', 's2'));
            await ledger.close();
            deepEqual(engine.calls(), ['follow', 'turnEnded', 'follow', 'turnEnded', 'unfollow', 'unfollow']);
        },
    },
    {
        id: 'H-12',
        title: 'HERDR_ENV=1 leaves hooks and env empty and calls nothing',
        run: async (engine) => {
            const ledger = createSessionLedger(engine, {}, { HERDR_ENV: '1' });
            deepEqual(ledger.hooks, {});
            deepEqual(ledger.env, {});
            deepEqual(engine.calls(), []);
        },
    },
    {
        id: 'H-13',
        title: 'SESSION_LEDGER_WRITER=1 leaves hooks and env empty and calls nothing',
        run: async (engine) => {
            const ledger = createSessionLedger(engine, {}, { SESSION_LEDGER_WRITER: '1' });
            deepEqual(ledger.hooks, {});
            deepEqual(ledger.env, {});
            deepEqual(engine.calls(), []);
        },
    },
    {
        id: 'H-14',
        title: 'a writing host passes the writer flag to the SDK environment',
        run: async (engine) => {
            deepEqual(createSessionLedger(engine).env, { SESSION_LEDGER_WRITER: '1' });
        },
    },
    {
        id: 'H-15',
        title: 'scopeOf chooses the scope of a session',
        run: async (engine) => {
            const ledger = createSessionLedger(engine, { scopeOf: (id) => scope(`custom:${id}`) });
            await fire(ledger, 'Stop', hook('Stop'));
            deepEqual(engine.followedBy(harness('claude'), session('s1')), { scope: scope('custom:s1'), key: 's1' });
        },
    },
    {
        id: 'H-16',
        title: 'mergeHooks concatenates the matchers of each event',
        run: async (engine) => {
            const first = createSessionLedger(engine).hooks;
            const second = createSessionLedger(engine).hooks;
            const merged = mergeHooks(first, second);
            equal(merged.Stop?.length, 2);
            equal(merged.SessionEnd?.length, 2);
            equal(merged.PostCompact?.length, 2);
        },
    },
];
