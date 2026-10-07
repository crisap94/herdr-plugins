import { test } from 'node:test';
import { requestOf } from '#test/support.ts';
import assert from 'node:assert/strict';
import { OpencodeHarness } from '#src/adapters/opencode-harness.ts';
import { RecapWriter } from '#src/adapters/recap-writer.ts';
import type { Runner } from '#src/adapters/run.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const opencode = (runner: Runner): RecapWriter => new RecapWriter(new OpencodeHarness(process.cwd(), 100, { runner, relistMs: 1 }), { model: '', effort: 'default' });
const request = requestOf({ entries: [{ role: 'user', text: 'hi' }] });

const done = (stdout: string, timedOut = false): ReturnType<Runner> => Promise.resolve({ code: timedOut ? 143 : 0, stdout, stderr: '', timedOut });

/** A scripted opencode: the run is killed by the timeout before it prints a session id, and the session shows up in the list later. */
function scripted(listings: readonly (readonly string[])[]): { runner: Runner; calls: string[] } {
    const calls: string[] = [];
    let title = '';
    let listed = 0;
    const runner: Runner = (_command, args) => {
        calls.push(args.slice(0, 2).join(' '));
        if (args[0] === 'run') {
            title = args[args.indexOf('--title') + 1] ?? '';
            return done('', true);
        }
        if (args[0] === 'session' && args[1] === 'list') {
            const ids = listings[Math.min(listed, listings.length - 1)] ?? [];
            listed += 1;
            return done(JSON.stringify([...ids.map((id) => ({ id, title })), { id: 'ses_other', title: 'somebody else' }]));
        }
        calls[calls.length - 1] = `session delete ${args[2] ?? ''}`;
        return done('');
    };
    return { runner, calls };
}

test('a timed-out opencode run that printed no session id leaves nothing behind: list by title, delete', async () => {
    const { runner, calls } = scripted([['ses_1']]);
    const written = await opencode(runner).write(request);
    assert.ok(isUnknown(written) && written.why.why === 'timeout');
    assert.deepEqual(calls.filter((call) => call.startsWith('session delete')), ['session delete ses_1', 'session delete ses_1'], 'listed twice, the same id seen twice');
    assert.equal(calls[0], 'run --pure');
    assert.ok(!calls.includes('session delete ses_other'), "somebody else's session is never touched");
});

test('a session opencode finishes writing AFTER the kill is caught by the one delayed re-list', async () => {
    const { runner, calls } = scripted([[], ['ses_late']]);
    await opencode(runner).write(request);
    assert.deepEqual(calls.filter((call) => call.startsWith('session delete')), ['session delete ses_late']);
    assert.deepEqual(calls.filter((call) => call.startsWith('session list')).length, 2, 'exactly one re-list');
});

test('when the run printed its session id it is deleted by id, with no listing', async () => {
    const calls: string[] = [];
    const runner: Runner = (_command, args) => {
        calls.push(args.slice(0, 2).join(' '));
        const stdout = args[0] === 'run' ? `${JSON.stringify({ type: 'text', sessionID: 'ses_9', part: { text: '## Goal\n- x' } })}\n` : '';
        return Promise.resolve({ code: 0, stdout, stderr: '', timedOut: false });
    };
    const written = await opencode(runner).write(request);
    assert.ok(written.kind === 'written');
    assert.deepEqual(calls, ['run --pure', 'session delete']);
});
