import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawned } from './support/spawn.ts';
import { fakeOutput, fakeRuntime } from '../../tab-recap/test/fakes/harness-runtime.ts';
import { requestOf } from '../../tab-recap/test/support.ts';
import { claudeWriter, composeEngine, followedOf, languageOf, ledgerPathOf, markedRuntime, openingOf, recordsMatchSession, stateDirOf, WRITER_MARKER, WRITER_MARKER_VALUE } from '../src/compose.ts';
import { SESSION, TURNS, tempHost } from './support/host.ts';

const REFRESH_TURNS = join(import.meta.dirname, 'support', 'refresh-turns.ts');

test('the followed session comes from the hook: one scope per session, the session id as its pane and its session, a claude agent in the hook cwd', () => {
    const followed = followedOf({ session: SESSION, records: `/home/user/.claude/projects/p/${SESSION}.jsonl`, cwd: '/tmp/work' });
    assert.equal(String(followed.scope), `claude-code:${SESSION}`);
    assert.equal(String(followed.session.pane), SESSION);
    assert.equal(String(followed.session.session), SESSION);
    assert.equal(String(followed.session.tab), `claude-code:${SESSION}`);
    assert.equal(String(followed.session.agent), 'claude');
    assert.equal(String(followed.session.cwd), '/tmp/work');
});

test('the transcript reader finds the hook transcript only when its file is named after the session', () => {
    assert.equal(recordsMatchSession({ session: SESSION, records: `/x/projects/p/${SESSION}.jsonl`, cwd: '/x' }), true);
    assert.equal(recordsMatchSession({ session: SESSION, records: '/x/projects/p/other.jsonl', cwd: '/x' }), false);
});

test('the state folder is the setting, else under XDG_STATE_HOME, else under ~/.local/state; never the herdr plugin state', () => {
    assert.equal(stateDirOf({ SESSION_LEDGER_STATE_DIR: '/s' }, '/h'), '/s');
    assert.equal(stateDirOf({ XDG_STATE_HOME: '/x' }, '/h'), '/x/session-ledger/claude-code');
    assert.equal(stateDirOf({ XDG_STATE_HOME: ' ' }, '/h'), '/h/.local/state/session-ledger/claude-code');
    assert.equal(stateDirOf({ HERDR_PLUGIN_STATE_DIR: '/herdr', TAB_RECAP_STATE: '/tab' }, '/h'), '/h/.local/state/session-ledger/claude-code');
    assert.equal(ledgerPathOf('/s'), '/s/ledger.db');
});

test('the recap language follows tab-recap: the setting, else the UI locale from the setting or the POSIX locale, English by default', () => {
    assert.equal(languageOf({}), 'en');
    assert.equal(languageOf({ LANG: 'es_CO.UTF-8' }), 'es');
    assert.equal(languageOf({ LANG: 'es_CO.UTF-8', SESSION_LEDGER_LOCALE: 'en' }), 'en');
    assert.equal(languageOf({ SESSION_LEDGER_RECAP_LANG: 'Spanish' }), 'es');
    assert.equal(languageOf({ SESSION_LEDGER_RECAP_LANG: 'ui', LC_ALL: 'es_ES' }), 'es');
    assert.equal(languageOf({ SESSION_LEDGER_RECAP_LANG: 'Deutsch' }), 'Deutsch');
});

test('every writer run carries the marker, over an inherited environment and over a closed one', async () => {
    const runtime = fakeRuntime({ scripts: { claude: [fakeOutput({ text: 'a' }), fakeOutput({ text: 'b' }), fakeOutput({ text: 'c' })] } });
    const marked = markedRuntime(runtime);
    const credential = { mode: 'login-store', acknowledgePolicy: true } as const;
    await marked.headless('claude', { credential, env: { kind: 'inherit', transform: (source) => ({ ...source, KEPT: 'yes' }) } }).run({ instructions: 'i', input: 'x' });
    await marked.headless('claude', { credential }).run({ instructions: 'i', input: 'x' });
    await marked.headless('claude', { credential, env: { kind: 'closed', set: { PATH: '/bin' } } }).run({ instructions: 'i', input: 'x' });
    const [inherited, bare, closed] = runtime.calls.map((call) => call.options.env);
    assert.ok(inherited?.kind === 'inherit' && bare?.kind === 'inherit' && closed?.kind === 'closed');
    assert.deepEqual(inherited.transform?.({ HOME: '/h' }), { HOME: '/h', KEPT: 'yes', [WRITER_MARKER]: WRITER_MARKER_VALUE });
    assert.deepEqual(bare.transform?.({ HOME: '/h' }), { HOME: '/h', [WRITER_MARKER]: WRITER_MARKER_VALUE });
    assert.deepEqual(closed.set, { PATH: '/bin', [WRITER_MARKER]: WRITER_MARKER_VALUE });
});

test('the claude writer runs through the marked runtime, and refuses without the policy acknowledgement as tab-recap does', async () => {
    const answered = fakeRuntime({ scripts: { claude: [fakeOutput({ text: '{"ops":[]}', cost: { usd: 0.01, basis: 'list' } })] } });
    const written = await claudeWriter(answered, { SESSION_LEDGER_CLAUDE_POLICY_ACK: 'on' }, () => undefined).write(requestOf());
    assert.deepEqual(written, { kind: 'written', text: '{"ops":[]}', costUsd: 0.01 });
    const env = answered.calls[0]?.options.env;
    assert.equal(env?.kind === 'inherit' ? env.transform?.({})[WRITER_MARKER] : null, WRITER_MARKER_VALUE);
    const refused = fakeRuntime({ scripts: { claude: [fakeOutput({ text: 'never' })] } });
    const notAcknowledged = await claudeWriter(refused, {}, () => undefined).write(requestOf());
    assert.equal(notAcknowledged.kind, 'unknown');
    assert.equal(refused.calls.length, 0);
});

test('the composed engine keeps the session ledger in its own SQLite file under the state folder', async () => {
    const host = tempHost();
    try {
        const composed = composeEngine(host.plugs);
        assert.equal(composed.kind, 'ready');
        if (composed.kind !== 'ready') {
            return;
        }
        const followed = followedOf(host.hook);
        host.grow(TURNS.slice(0, 2));
        await composed.engine.refresh(followed.scope, [followed.session]);
        const runs = composed.store.inputs.runs({ tab: String(followed.scope), since: null, limit: 10, withInput: false });
        assert.equal(runs.length, 1);
        assert.equal(host.seen.length, 1);
        composed.close();
        const opening = openingOf(host.plugs)();
        assert.equal(opening.kind, 'opened');
        if (opening.kind === 'opened') {
            opening.opened.close();
        }
    } finally {
        host.dispose();
    }
});

test('two processes writing one ledger at once, each for its own session, both keep every run', async () => {
    const host = tempHost();
    try {
        const startAt = String(Date.now() + 1500);
        const sessions = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'];
        const outcomes = await Promise.all(sessions.map((session) => spawned([REFRESH_TURNS, host.root, host.stateDir, session, startAt])));
        assert.deepEqual(outcomes.map((outcome) => [outcome.code, outcome.out]), [[0, 'done'], [0, 'done']], JSON.stringify(outcomes));
        const composed = composeEngine(host.plugs);
        assert.equal(composed.kind, 'ready');
        if (composed.kind !== 'ready') {
            return;
        }
        for (const session of sessions) {
            const scope = followedOf({ session, records: '', cwd: host.root }).scope;
            assert.equal(composed.store.inputs.runs({ tab: String(scope), since: null, limit: 10, withInput: false }).length, 3, session);
        }
        composed.close();
    } finally {
        host.dispose();
    }
});
