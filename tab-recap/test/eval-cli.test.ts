import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stateStore } from '#src/adapters/db/database.ts';
import { cursor } from '#test/db/support.ts';
import { oneTask, withFacts } from '#test/support.ts';

const entry = join(import.meta.dirname, '..', 'bin', 'tab-recap.ts');

function run(args: readonly string[], input = ''): { status: number | null; stdout: string; stderr: string; state: string; done: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-eval-'));
    const state = join(root, 'state');
    const ran = spawnSync(process.execPath, [entry, ...args], {
        encoding: 'utf8', input,
        env: { PATH: '', HOME: root, HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'), TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en' },
    });
    return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr, state, done: () => { rmSync(root, { recursive: true, force: true }); } };
}

function seeded(): ReturnType<typeof run> {
    const root = mkdtempSync(join(tmpdir(), 'tab-recap-eval-'));
    const state = join(root, 'state');
    const store = stateStore(state);
    assert.ok(store.kind === 'ready');
    store.records.recordRun({ tab: 'w1:t1', at: Date.now(), cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], ...withFacts(oneTask('', { goal: 'Ship retries', now: [], needs: [], done: ['Merged !256.'], decisions: [], next: [], links: [], rules: [] })), input: '<recap_input version="1"/>' });
    store.close();
    return { status: null, stdout: '', stderr: '', state, done: () => { rmSync(root, { recursive: true, force: true }); } };
}

function against(state: string, args: readonly string[], input = ''): { status: number | null; stdout: string; stderr: string } {
    const ran = spawnSync(process.execPath, [entry, ...args], {
        encoding: 'utf8', input, env: { PATH: '', HOME: state, HERDR_PLUGIN_CONFIG_DIR: join(state, '..', 'config'), TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en' },
    });
    return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

test('conflicting options print the usage line on stderr and exit 2: --label with --agree, --gates with --sample, an unknown option, a bad number', () => {
    for (const args of [['--label', '10', '--agree'], ['--gates', '--sample', '5'], ['--agree', '--gates'], ['--frobnicate'], ['--sample', 'many'], ['--since', '0'], ['extra']]) {
        const ran = run(['eval', ...args]);
        try {
            assert.equal(ran.status, 2, args.join(' '));
            assert.match(ran.stderr, /USAGE: tab-recap eval \[--sample <n>\]/);
            assert.equal(ran.stdout, '');
        } finally {
            ran.done();
        }
    }
});

test('with no harness for the judge, `eval` says so on stderr and exits 1 without storing a verdict', () => {
    const fixture = seeded();
    try {
        const ran = against(fixture.state, ['eval']);
        assert.equal(ran.status, 1, ran.stderr);
        assert.match(ran.stderr, /no harness is available for the judge job/);
        const store = stateStore(fixture.state);
        assert.ok(store.kind === 'ready');
        assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM verdict').get()?.['n'], 0);
        store.close();
    } finally {
        fixture.done();
    }
});

test('`eval --gates` and `--agree` need no model: they print on an empty state and exit 0, and `--json` prints JSON', () => {
    const ran = run(['eval', '--gates']);
    const agree = run(['eval', '--agree', '--json']);
    try {
        assert.deepEqual([ran.status, agree.status], [0, 0], ran.stderr + agree.stderr);
        assert.match(ran.stdout, /gates over 0 runs\nnothing refused or flagged\n0 items dropped/);
        assert.deepEqual(JSON.parse(agree.stdout), []);
    } finally {
        ran.done();
        agree.done();
    }
});

test('`eval --label` reads its answers from scripted stdin and stores them as operator verdicts that `--agree` can join', () => {
    const fixture = seeded();
    try {
        const ran = against(fixture.state, ['eval', '--label', '2'], 'ok\nfail I3\nno file named\n');
        assert.equal(ran.status, 0, ran.stderr);
        assert.match(ran.stdout, /"Ship retries"/);
        assert.match(ran.stdout, /"Merged !256\."/);
        assert.match(ran.stdout, /2 of 2 items answered/);
        const store = stateStore(fixture.state);
        assert.ok(store.kind === 'ready');
        const rows = store.db.prepare("SELECT item_key, check_id, pass, critique, source FROM verdict WHERE source = 'operator' AND pass = 0").all().map((row) => Object.assign({}, row));
        assert.deepEqual(rows, [{ item_key: 't1/done/0', check_id: 'I3', pass: 0, critique: 'no file named', source: 'operator' }]);
        assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM verdict').get()?.['n'], 16);
        store.close();
        assert.match(against(fixture.state, ['eval', '--agree']).stdout, /no item has both/);
    } finally {
        fixture.done();
    }
});

test('`eval` is listed among the commands', () => {
    const ran = run(['--help']);
    try {
        assert.ok(ran.stdout.includes('eval'));
    } finally {
        ran.done();
    }
});
