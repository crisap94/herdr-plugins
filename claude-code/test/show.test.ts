import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { instant } from '../../tab-recap/src/recap/domain/time.ts';
import type { Instant } from '../../tab-recap/src/recap/domain/time.ts';
import { ledgerPathOf } from '../src/compose.ts';
import { hookArgsOf } from '../src/runner-plugs.ts';
import { newestSessionIn, noteSession, sessionNamed } from '../src/sessions.ts';
import { lineAnswer, showAnswer, showArgsOf, USAGE } from '../src/show.ts';
import type { CommandIo } from '../src/show.ts';
import { keptLedger } from './support/ledger.ts';

const COMMAND = join(import.meta.dirname, '..', 'scripts', 'session-ledger');

const ioOf = (stateDir: string, cwd: string): CommandIo => ({ stateDir, cwd, clock: { now: (): Instant => instant(Date.now()) }, log: () => undefined });

const SESSION = 'fx-show-1';

test('show prints, for the newest session of the current folder, the open facts the fake writer wrote, grouped for a human', async () => {
    const { host, facts } = await keptLedger(SESSION);
    try {
        noteSession(host.stateDir, { session: 'fx-older', records: '/r/fx-older.jsonl', cwd: host.hook.cwd }, 1);
        noteSession(host.stateDir, host.hook, 2);
        const before = statSync(ledgerPathOf(host.stateDir)).mtimeMs;
        const answer = showAnswer(ioOf(host.stateDir, host.hook.cwd), []);
        assert.equal(answer.code, 0);
        assert.equal(answer.err, '');
        const open = facts.open.filter((fact) => fact.state === 'open');
        assert.ok(open.length > 0);
        for (const fact of open) {
            assert.ok(answer.out.includes(`  - ${fact.text}\n`), fact.text);
        }
        assert.ok(answer.out.startsWith(`session  ${SESSION}\nfolder   ${host.hook.cwd}\nupdated  `));
        assert.deepEqual(showAnswer(ioOf(host.stateDir, '/elsewhere'), ['--session', SESSION]), answer);
        assert.equal(statSync(ledgerPathOf(host.stateDir)).mtimeMs, before);
    } finally {
        host.dispose();
    }
});

test('show says so when no session is kept for the folder, and refuses bad arguments with the usage', async () => {
    const { host } = await keptLedger(SESSION);
    try {
        const none = showAnswer(ioOf(host.stateDir, '/elsewhere'), []);
        assert.deepEqual(none, { code: 1, out: '', err: 'session-ledger: no ledger is kept for a session started in /elsewhere\n' });
        assert.deepEqual(showAnswer(ioOf(host.stateDir, '/elsewhere'), ['--session']), { code: 2, out: '', err: USAGE });
        assert.deepEqual(showArgsOf(['--session', 'a', 'b']), { kind: 'usage' });
        assert.deepEqual(showArgsOf(['--session', 'a']), { kind: 'session', session: 'a' });
    } finally {
        host.dispose();
    }
});

test('line prints one short status line for the session named on stdin, and nothing for a session never kept', async () => {
    const { host, facts } = await keptLedger(SESSION);
    try {
        noteSession(host.stateDir, host.hook, 2);
        const io = ioOf(host.stateDir, '/elsewhere');
        const open = facts.open.filter((fact) => fact.state === 'open').length;
        const at = new Date(facts.lastRun?.at ?? 0).toISOString().slice(0, 16).replace('T', ' ');
        assert.deepEqual(lineAnswer(io, JSON.stringify({ session_id: SESSION, model: { id: 'x' } })), { code: 0, out: `ledger ${open} open · ${at} UTC\n`, err: '' });
        assert.deepEqual(lineAnswer(io, JSON.stringify({ session_id: 'unknown' })), { code: 0, out: '', err: '' });
        assert.deepEqual(lineAnswer(io, 'not json'), { code: 0, out: '', err: '' });
    } finally {
        host.dispose();
    }
});

test('the sessions index keeps the newest note per folder and finds a session by its id', async () => {
    const { host } = await keptLedger(SESSION);
    try {
        noteSession(host.stateDir, { session: 'a', records: '/r/a.jsonl', cwd: '/w' }, 5);
        noteSession(host.stateDir, { session: 'b', records: '/r/b.jsonl', cwd: '/w' }, 9);
        noteSession(host.stateDir, { session: 'a', records: '/r/a.jsonl', cwd: '/w' }, 12);
        assert.equal(newestSessionIn(host.stateDir, '/w')?.session, 'a');
        assert.equal(sessionNamed(host.stateDir, 'b')?.at, 9);
        assert.equal(newestSessionIn(host.stateDir, '/none'), null);
    } finally {
        host.dispose();
    }
});

test('the runner takes the session, transcript and folder as its arguments', () => {
    assert.deepEqual(hookArgsOf(['s', '/r/s.jsonl', '/w']), { kind: 'hook', hook: { session: 's', records: '/r/s.jsonl', cwd: '/w' } });
    assert.deepEqual(hookArgsOf(['s', '/r/s.jsonl']), { kind: 'usage' });
});

test('the session-ledger command runs show and line from a terminal, read-only over the ledger', async () => {
    const { host } = await keptLedger(SESSION);
    try {
        noteSession(host.stateDir, host.hook, 2);
        const env = { PATH: process.env['PATH'] ?? '', HOME: '/nonexistent', SESSION_LEDGER_STATE_DIR: host.stateDir };
        const shown = spawnSync('/bin/sh', [COMMAND, 'show'], { cwd: host.hook.cwd, encoding: 'utf8', env });
        assert.equal(shown.status, 0, shown.stderr);
        assert.ok(shown.stdout.startsWith(`session  ${SESSION}\n`));
        const line = spawnSync('/bin/sh', [COMMAND, 'line'], { input: JSON.stringify({ session_id: SESSION }), encoding: 'utf8', env });
        assert.equal(line.status, 0);
        assert.match(line.stdout, /^ledger \d+ open · \d{4}-\d\d-\d\d \d\d:\d\d UTC\n$/u);
        const usage = spawnSync('/bin/sh', [COMMAND, 'nope'], { encoding: 'utf8', env });
        assert.deepEqual([usage.status, usage.stdout, usage.stderr], [2, '', USAGE]);
        assert.equal(readFileSync(join(host.stateDir, 'sessions', `${SESSION}.json`), 'utf8').includes(host.hook.records), true);
    } finally {
        host.dispose();
    }
});
