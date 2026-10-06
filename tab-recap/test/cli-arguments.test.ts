import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entry = join(import.meta.dirname, '..', 'bin', 'tab-recap.ts');

/** Runs the entry in a throw-away config and state directory, so no command can touch the real ones. */
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

const COMMANDS = ['show', 'configure', 'start', 'startup', 'ensure', 'stop', 'toggle', 'status', 'column', 'columns', 'refresh', 'compact', 'backend'];

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
