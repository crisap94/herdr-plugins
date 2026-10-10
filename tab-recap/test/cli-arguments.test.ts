import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entry = join(import.meta.dirname, '..', 'bin', 'tab-recap.ts');

function run(...args: string[]): { status: number | null; stdout: string; stderr: string; config: string; state: string; done: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-cli-'));
    const config = join(root, 'config');
    const state = join(root, 'state');
    const ran = spawnSync(process.execPath, [entry, ...args], {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', HOME: root, HERDR_PLUGIN_CONFIG_DIR: config, TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en' },
    });
    return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr, config, state, done: () => { rmSync(root, { recursive: true, force: true }); } };
}

const COMMANDS = ['show', 'configure', 'start', 'startup', 'ensure', 'stop', 'toggle', 'status', 'column', 'columns', 'refresh', 'compact', 'backend', 'autocompact'];

test('`backend codex gpt-5-mini` still sets the backend and its model', () => {
    const ran = run('backend', 'codex', 'gpt-5-mini');
    try {
        assert.equal(ran.status, 0, ran.stderr);
        const written = readFileSync(join(ran.config, 'config.env'), 'utf8');
        assert.match(written, /TAB_RECAP_BACKEND=codex/);
        assert.match(written, /TAB_RECAP_MODEL_CODEX=gpt-5-mini/);
    } finally {
        ran.done();
    }
});

test('an unknown command prints the usage on stderr and exits 2', () => {
    const ran = run('frobnicate');
    try {
        assert.equal(ran.status, 2);
        assert.match(ran.stderr, /USAGE: tab-recap/);
        assert.equal(ran.stdout, '');
    } finally {
        ran.done();
    }
});

function assertHelp(flag: string, extra: readonly string[]): void {
    const ran = run(flag, ...extra);
    try {
        assert.equal(ran.status, 0, ran.stderr);
        for (const command of COMMANDS) {
            assert.ok(ran.stdout.includes(command), `${flag} lists ${command}`);
        }
        assert.equal(ran.stderr, '');
        assert.equal(existsSync(ran.state) ? readdirSync(ran.state).length : 0, 0, 'no state written');
        assert.equal(existsSync(ran.config), false);
    } finally {
        ran.done();
    }
}

test('--help and -h print the usage with every command on stdout, exit 0 and change nothing, whatever else is given', () => {
    for (const [flag, extra] of [['--help', []], ['-h', []], ['--help', ['stop']], ['-h', ['start']]] as const) {
        assertHelp(flag, extra);
    }
});

test('a mistyped option names the option, prints the usage on stderr, exits 2 and does not start the daemon', () => {
    const ran = run('start', '--forse');
    try {
        assert.equal(ran.status, 2);
        assert.match(ran.stderr, /--forse/);
        assert.match(ran.stderr, /USAGE: tab-recap/);
        assert.equal(existsSync(join(ran.state, 'daemon.pid')), false);
        assert.equal(existsSync(join(ran.state, 'daemon.log')), false);
    } finally {
        ran.done();
    }
});

test('`eval --replay`: a missing transcript is a could-not-look error, an unknown option or one that does not go with it a usage error; the plain commands still refuse options', () => {
    for (const [args, status, says] of [[['eval', '--bogus'], 2, /Unknown option/], [['eval', '--replay', '/nonexistent/s.jsonl'], 3, /cannot read/], [['eval', '--replay', 'x', '--sample', '3'], 2, /--replay excludes --sample/], [['eval', '--kind', 'codex'], 2, /go with --replay/], [['status', '--replay', 'x'], 2, /USAGE: tab-recap/]] as const) {
        const ran = run(...args);
        try {
            assert.equal(ran.status, status, args.join(' '));
            assert.match(ran.stderr, says);
            assert.equal(ran.stdout, '');
            assert.equal(existsSync(ran.state) ? readdirSync(ran.state).length : 0, 0, 'no state written');
        } finally {
            ran.done();
        }
    }
});

test('`eval --replay --kind` refuses kinds outside the replay readers with status 2 and no stdout', () => {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-replay-kind-'));
    const file = join(root, 'transcript.jsonl');
    writeFileSync(file, '');
    try {
        for (const kind of ['opencode', 'foo', 'constructor']) {
            const ran = run('eval', '--replay', file, '--kind', kind);
            try {
                assert.equal(ran.status, 2, kind);
                assert.match(ran.stderr, /--kind takes claude or codex/, kind);
                assert.equal(ran.stdout, '', kind);
            } finally {
                ran.done();
            }
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('`autocompact`: three decisions print three rows newest first with share, verdict, decider and cost and the last day\'s total; an option other than --all is a usage error; no column is touched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-autocompact-'));
    const state = join(root, 'state');
    try {
        const { stateStore } = await import('#src/adapters/db/database.ts');
        const store = stateStore(state);
        assert.equal(store.kind, 'ready');
        store.db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 2)");
        const now = Date.now();
        for (const [age, verdict, share, cost] of [[3, 'compact', 71, 0.00003], [2, 'wait', 55, 0.00004], [1, 'unknown', 44, 0]] as const) {
            store.autocompact.record({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: now - age * 60_000, mode: 'shadow', share, tokens: 1, window: 2, gate: 'ask', verdict, answers: {}, coverage: null, decider: 'jev · jev-1.13.0', costUsd: cost, tookMs: 5, why: null });
        }
        store.close();
        const env = { PATH: process.env['PATH'] ?? '', HOME: root, HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'), TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en' };
        const ran = spawnSync(process.execPath, [entry, 'autocompact', '--all'], { encoding: 'utf8', env });
        assert.equal(ran.status, 0, ran.stderr);
        const rows = ran.stdout.split('\n').filter((line) => line.includes('w1:t1'));
        assert.deepEqual(rows.map((line) => line.split(/\s{2,}/)[3]), ['44 %', '55 %', '71 %']);
        assert.match(ran.stdout, /time\s+tab\s+pane\s+share\s+verdict\s+gate\s+decider\s+cost/);
        assert.match(ran.stdout, /jev · jev-1\.13\.0\s+\$0\.00003/);
        assert.match(ran.stdout, /last 24 h: 3 decisions, \$0\.00007$/m);
        const bad = spawnSync(process.execPath, [entry, 'autocompact', '--nope'], { encoding: 'utf8', env });
        assert.deepEqual([bad.status, bad.stdout], [2, '']);
        assert.match(bad.stderr, /USAGE: tab-recap autocompact \[--all\]/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('`autocompact` with nothing decided says so and still prints the total', () => {
    const ran = run('autocompact');
    try {
        assert.equal(ran.status, 0, ran.stderr);
        assert.match(ran.stdout, /no autocompact decisions yet\nlast 24 h: 0 decisions, \$0/);
    } finally {
        ran.done();
    }
});
