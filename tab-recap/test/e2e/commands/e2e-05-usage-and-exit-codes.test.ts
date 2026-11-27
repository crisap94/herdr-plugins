import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { evalWorld, type EvalWorld } from '../support/eval-world.ts';
import type { Ran } from '../support/daemon-world.ts';

describe('the command line says what is wrong and exits with a code that tells', () => {
    let world: EvalWorld;

    const cli = (...args: readonly string[]): Promise<Ran> => world.run(args);

    before(() => {
        world = evalWorld({ judge: 'none' });
    });

    after(() => {
        world.close();
    });

    test('an unknown word exits 2 with the usage on stderr and nothing on stdout', { timeout: 30_000 }, async () => {
        const ran = await cli('frobnicate');
        assert.equal(ran.code, 2);
        assert.equal(ran.stdout, '');
        assert.match(ran.stderr, /^tab-recap: 2 — USAGE: tab-recap /);
        assert.match(ran.stderr, /show\|compact\|handoff\|configure\|start\|startup\|ensure\|stop\|toggle\|status\|column\|columns\|refresh\|backend\|eval\|autocompact/);
    });

    test('no word at all is the same usage error', { timeout: 30_000 }, async () => {
        const ran = await cli();
        assert.equal(ran.code, 2);
        assert.match(ran.stderr, /^tab-recap: 2 — USAGE: tab-recap /);
    });

    test('--help exits 0 with the usage on stdout, as does -h, and after a command word', { timeout: 30_000 }, async () => {
        for (const args of [['--help'], ['-h'], ['status', '--help']]) {
            const ran = await cli(...args);
            assert.equal(ran.code, 0, args.join(' '));
            assert.match(ran.stdout, /^USAGE: tab-recap /, args.join(' '));
            assert.equal(ran.stderr, '', args.join(' '));
        }
    });

    test('a command that needs a tab, run with none, exits 3 and says the tab is unknown', { timeout: 30_000 }, async () => {
        for (const word of ['refresh', 'column', 'compact', 'show']) {
            const ran = await cli(word);
            assert.equal(ran.code, 3, `${word}: ${ran.stderr}`);
            assert.equal(ran.stdout, '', word);
            assert.match(ran.stderr, /^tab-recap: 3 — /, word);
        }
    });

    test('the same command with a tab in the herdr context is no longer a tab error', { timeout: 30_000 }, async () => {
        const ran = await world.run(['refresh'], { env: { HERDR_TAB_ID: 'w1:t1' } });
        assert.equal(ran.code, 0, ran.stderr);
        assert.equal(ran.stdout, 'tab-recap: recap requested for w1:t1\n');
    });

    test('an option that does not belong to the command, or does not exist, exits 2 and names it', { timeout: 30_000 }, async () => {
        const stray = await cli('status', '--tab', 'w1:t2');
        assert.equal(stray.code, 2);
        assert.match(stray.stderr, /^tab-recap: 2 — --tab applies to handoff and eval only\nUSAGE: tab-recap /);
        const note = await cli('refresh', '--note', 'x');
        assert.equal(note.code, 2);
        assert.match(note.stderr, /^tab-recap: 2 — --note applies to compact and handoff only\n/);
        const only = await cli('status', '--print');
        assert.equal(only.code, 2);
        assert.match(only.stderr, /^tab-recap: 2 — --print applies to handoff only\n/);
        const unknown = await cli('status', '--bogus');
        assert.equal(unknown.code, 2);
        assert.match(unknown.stderr, /^tab-recap: 2 — .*--bogus/);
    });

    test('a handoff that is missing, doubles or mixes its options exits 2 with the problem before the usage', { timeout: 30_000 }, async () => {
        const cases: readonly (readonly [readonly string[], string])[] = [
            [['handoff', '--to', 'w1:p2'], '--from is required'],
            [['handoff', '--from', 'w1:p1'], '--to is required unless --print'],
            [['handoff', '--from', 'w1:p1', '--from', 'w1:p3', '--to', 'w1:p2'], '--from given more than once'],
            [['handoff', '--from', 'w1:p1', '--print', '--refresh'], '--refresh does not go with --print'],
            [['handoff', '--from', '', '--to', 'w1:p2'], '--from needs a pane id'],
            [['handoff', '--from', 'w1:p1', '--to', 'w1:p2', 'extra'], 'handoff takes no argument'],
            [['handoff', '--list-closed'], '--list-closed needs --tab'],
        ];
        for (const [args, problem] of cases) {
            const ran = await cli(...args);
            assert.equal(ran.code, 2, args.join(' '));
            assert.equal(ran.stdout, '', args.join(' '));
            assert.ok(ran.stderr.startsWith(`tab-recap: 2 — ${problem}\nUSAGE: tab-recap `), `${args.join(' ')}: ${ran.stderr}`);
        }
    });

    test('a backend that does not exist exits 2 with the list to choose from', { timeout: 30_000 }, async () => {
        const ran = await cli('backend', 'nonsense');
        assert.equal(ran.code, 2);
        assert.match(ran.stderr, /^tab-recap: 2 — .*auto\|/);
    });
});
