import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stateStore } from '#src/adapters/db/database.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';

const entry = join(import.meta.dirname, '..', 'bin', 'tab-recap.ts');

interface Run {
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly state: string;
    readonly database: boolean;
    done(): void;
}

function run(args: readonly string[], seed: (state: string) => void = () => {}): Run {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-handoff-cli-'));
    const state = join(root, 'state');
    mkdirSync(state, { recursive: true });
    seed(state);
    const ran = spawnSync(process.execPath, [entry, ...args], {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', HOME: root, HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'), TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en' },
    });
    return {
        status: ran.status,
        stdout: ran.stdout,
        stderr: ran.stderr,
        state,
        database: existsSync(join(state, 'tab-recap.db')),
        done: () => { rmSync(root, { recursive: true, force: true }); },
    };
}

function withRun(args: readonly string[], check: (ran: Run) => void, seed?: (state: string) => void): void {
    const ran = run(args, seed);
    try {
        check(ran);
    } finally {
        ran.done();
    }
}

const runningDaemon = (version: string) => (state: string): void => {
    writeFileSync(join(state, 'daemon.pid'), `${process.pid}\n`);
    writeFileSync(join(state, 'daemon.version'), `${version}\n`);
};

test('a handoff to the same lane is refused on stderr with exit 1, and no state is written', () => {
    withRun(['handoff', '--from', 'w1:p1', '--to', 'w1:p1'], (ran) => {
        assert.equal(ran.status, 1, ran.stderr);
        assert.equal(ran.stdout, '');
        assert.match(ran.stderr, /tab-recap: 1 — the source and the target are the same lane/);
        assert.equal(ran.database, false);
    });
});

test('with no daemon running, a handoff is refused daemon-not-running, exits 1 and opens no database', () => {
    withRun(['handoff', '--from', 'w1:p1', '--to', 'w1:p2'], (ran) => {
        assert.equal(ran.status, 1, ran.stderr);
        assert.match(ran.stderr, /the daemon is not running: nothing was sent/);
        assert.equal(ran.database, false);
    });
});

test('a daemon recording another code version is refused daemon-outdated and writes no request row', () => {
    withRun(['handoff', '--from', 'w1:p1', '--to', 'w1:p2'], (ran) => {
        assert.equal(ran.status, 1, ran.stderr);
        assert.match(ran.stderr, /the running daemon is another version/);
        assert.equal(ran.database, false);
    }, runningDaemon('0.0.1'));
});

test('a source that is a label rather than a lane is refused source-unavailable with nothing queued', () => {
    withRun(['handoff', '--from', 'my agent', '--to', 'w1:p2'], (ran) => {
        assert.equal(ran.status, 1, ran.stderr);
        assert.match(ran.stderr, /tab-recap does not know the source lane/);
        const store = stateStore(ran.state);
        assert.equal(store.kind, 'ready');
        assert.deepEqual(store.requests.takeHandoffs(), []);
        store.close();
    }, runningDaemon(codeVersion() ?? 'unknown'));
});

test('print with no content builder yet exits 1, says so on stderr, and opens no database', () => {
    withRun(['handoff', '--from', 'w1:p1', '--print'], (ran) => {
        assert.equal(ran.status, 1, ran.stderr);
        assert.equal(ran.stdout, '');
        assert.match(ran.stderr, /print needs the content builder/);
        assert.equal(ran.database, false);
    });
});

test('a missing --to, a repeated --from, a repeated --to and an option with no value are usage errors on stderr', () => {
    for (const [args, says] of [
        [['handoff', '--from', 'w1:p1'], /--to is required unless --print/],
        [['handoff', '--from', 'w1:p1', '--from', 'w1:p3', '--to', 'w1:p2'], /--from given more than once/],
        [['handoff', '--from', 'w1:p1', '--to', 'w1:p2', '--to', 'w1:p3'], /--to given more than once/],
        [['handoff', '--to', 'w1:p2', '--from'], /--from/],
    ] as const) {
        withRun([...args], (ran) => {
            assert.equal(ran.status, 2, args.join(' '));
            assert.match(ran.stderr, says, args.join(' '));
            assert.match(ran.stderr, /USAGE: tab-recap/);
            assert.equal(ran.stdout, '');
            assert.equal(ran.database, false);
        });
    }
});

test('an unknown option on handoff is a usage error', () => {
    withRun(['handoff', '--from', 'w1:p1', '--to', 'w1:p2', '--bogus'], (ran) => {
        assert.equal(ran.status, 2);
        assert.match(ran.stderr, /Unknown option/);
    });
});

test('--refresh with --print is a usage error', () => {
    withRun(['handoff', '--from', 'w1:p1', '--print', '--refresh'], (ran) => {
        assert.equal(ran.status, 2);
        assert.match(ran.stderr, /--refresh does not go with --print/);
    });
});

test('a handoff option given to another command is a usage error and starts nothing', () => {
    for (const [args, says] of [
        [['stop', '--from', 'w1:p1'], /--from applies to handoff only/],
        [['status', '--to', 'w1:p2'], /--to applies to handoff only/],
        [['refresh', '--print'], /--print applies to handoff only/],
        [['column', '--refresh'], /--refresh applies to handoff only/],
        [['status', '--note', 'keep it'], /--note applies to compact and handoff only/],
    ] as const) {
        withRun([...args], (ran) => {
            assert.equal(ran.status, 2, args.join(' '));
            assert.match(ran.stderr, says, args.join(' '));
            assert.equal(existsSync(join(ran.state, 'daemon.pid')), false, args.join(' '));
        });
    }
});

test('handoff appears in the usage and the help', () => {
    withRun(['--help'], (ran) => {
        assert.equal(ran.status, 0, ran.stderr);
        assert.match(ran.stdout, /handoff/);
    });
});
