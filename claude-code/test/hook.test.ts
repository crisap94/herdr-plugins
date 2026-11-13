import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreTextOf } from '../../tab-recap/src/recap/application/restore-text.ts';
import { FORBIDDEN } from '../../tab-recap/src/recap/domain/forbidden-words.ts';
import { instant } from '../../tab-recap/src/recap/domain/time.ts';
import type { Instant } from '../../tab-recap/src/recap/domain/time.ts';
import { answerOf, briefOf, CONTEXT_BUDGET_BYTES, contextJson, restoreFitted } from '../src/hook.ts';
import type { HookAnswer, HookDeps } from '../src/hook.ts';
import type { HookSession } from '../src/payload.ts';
import { LOG_FILE } from '../src/runner.ts';
import { fact } from '../../tab-recap/test/fakes/fact-at.ts';
import { keptLedger, payloadOf } from './support/ledger.ts';

const MAIN = join(import.meta.dirname, '..', 'src', 'main.ts');
const FAKE_RUNNER = join(import.meta.dirname, 'support', 'fake-runner.ts');
const TOOLING = /\b(ledger|tools?|plugins?|recaps?|tabs?|herdr|session-ledger|claude-code|hooks?)\b/iu;
const SILENT: HookAnswer = { kind: 'silent' };

interface Recorder {
    readonly deps: HookDeps;
    readonly started: HookSession[];
    readonly logged: string[];
}

function recorder(stateDir: string, env: HookDeps['env'] = {}, now = Date.now()): Recorder {
    const started: HookSession[] = [];
    const logged: string[] = [];
    return { started, logged, deps: { env, stateDir, clock: { now: (): Instant => instant(now) }, log: (line) => { logged.push(line); }, startRunner: (hook) => { started.push(hook); } } };
}

function scratch(): string {
    return mkdtempSync(join(tmpdir(), 'claude-code-hook-'));
}

test('Stop and PostCompact start the runner for the hook session and print nothing', () => {
    const dir = scratch();
    try {
        const seen = recorder(join(dir, 'state'));
        assert.deepEqual(answerOf('Stop', payloadOf('Stop-01-base'), seen.deps), SILENT);
        assert.deepEqual(answerOf('PostCompact', payloadOf('PostCompact-02-auto'), seen.deps), SILENT);
        assert.deepEqual(seen.started.map((hook) => hook.session), ['fx-Stop-1', 'fx-PostCompact-2']);
        assert.deepEqual(seen.started[0], { session: 'fx-Stop-1', records: '/home/user/.claude/projects/p/fx-Stop-1.jsonl', cwd: '/tmp/work' });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a Stop whose transcript is not named after its session is not followed, and says so in the log', () => {
    const seen = recorder('/nonexistent');
    const payload = JSON.stringify({ ...JSON.parse(payloadOf('Stop-01-base')) as object, transcript_path: '/x/projects/p/other.jsonl' });
    assert.deepEqual(answerOf('Stop', payload, seen.deps), SILENT);
    assert.deepEqual(seen.started, []);
    assert.match(seen.logged.join('\n'), /not named after the session/u);
});

test('SessionStart startup, clear and fork do nothing; compact and resume with no ledger print nothing', () => {
    const dir = scratch();
    try {
        const seen = recorder(join(dir, 'state'));
        for (const name of ['SessionStart-01-startup', 'SessionStart-03-clear', 'hand-SessionStart-fork', 'hand-SessionStart-compact', 'SessionStart-02-resume']) {
            assert.deepEqual(answerOf('SessionStart', payloadOf(name), seen.deps), SILENT, name);
        }
        assert.deepEqual(seen.started, []);
        assert.equal(existsSync(join(dir, 'state')), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('SessionStart after a compaction puts the facts back as additionalContext in the documented JSON shape, worded for the same agent', async () => {
    const { host, facts } = await keptLedger('fx-SessionStart-compact');
    try {
        const seen = recorder(host.stateDir, {}, host.clock.now);
        const answer = answerOf('SessionStart', payloadOf('hand-SessionStart-compact'), seen.deps);
        const text = restoreTextOf({ ...facts, at: instant(host.clock.now) });
        assert.notEqual(text, '');
        assert.deepEqual(answer, { kind: 'print', text: contextJson(text) });
        const parsed = JSON.parse(answer.kind === 'print' ? answer.text : '{}') as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
        assert.deepEqual(Object.keys(parsed), ['hookSpecificOutput']);
        assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
        assert.equal(FORBIDDEN.test(parsed.hookSpecificOutput.additionalContext), false);
        assert.equal(TOOLING.test(parsed.hookSpecificOutput.additionalContext), false);
        assert.match(parsed.hookSpecificOutput.additionalContext, /^These are my notes/u);
        assert.deepEqual(seen.logged, []);
    } finally {
        host.dispose();
    }
});

test('a session the ledger never followed gets nothing back on resume', async () => {
    const { host } = await keptLedger('fx-another-session');
    try {
        assert.deepEqual(answerOf('SessionStart', payloadOf('SessionStart-02-resume'), recorder(host.stateDir).deps), SILENT);
    } finally {
        host.dispose();
    }
});

test('the context stays under the hook cap of 10,000 characters: the restore is fitted to a smaller budget', () => {
    const at = instant(Date.UTC(2026, 0, 1));
    const open = Array.from({ length: 60 }, (_, index) => fact(`f${index}`, index % 2 === 0 ? 'done' : 'next', `a long fact number ${index} ${'x'.repeat(400)}`, at - index));
    const facts = { at, lastRun: { at, cause: 'turn-ended' as const }, open, closed: [] };
    assert.ok(Buffer.byteLength(restoreTextOf(facts)) > 10_000);
    const text = restoreFitted(facts);
    assert.ok(text.length > 0);
    assert.ok(Buffer.byteLength(text) <= CONTEXT_BUDGET_BYTES, `${Buffer.byteLength(text)}`);
    assert.ok(text.length <= 10_000);
});

test('PreCompact does nothing unless SESSION_LEDGER_PRECOMPACT=on; then it prints the template guidance built from the open facts', async () => {
    const { host, facts } = await keptLedger('fx-PreCompact-1');
    try {
        assert.deepEqual(answerOf('PreCompact', payloadOf('PreCompact-01-manual'), recorder(host.stateDir).deps), SILENT);
        const on = recorder(host.stateDir, { SESSION_LEDGER_PRECOMPACT: 'on' });
        const answer = answerOf('PreCompact', payloadOf('PreCompact-01-manual'), on.deps);
        const expected = briefOf(facts);
        assert.match(expected, /^When you summarize this conversation, keep these, most important first: \(1\) /u);
        assert.deepEqual(answer, { kind: 'print', text: expected });
        assert.equal(expected.includes('\n'), false);
        assert.equal(FORBIDDEN.test(expected), false);
        assert.equal(TOOLING.test(expected), false);
        assert.deepEqual(answerOf('PreCompact', payloadOf('PreCompact-02-auto'), on.deps), SILENT);
    } finally {
        host.dispose();
    }
});

test('a malformed payload, an unknown event and a payload of another event print nothing and are logged', () => {
    const seen = recorder('/nonexistent');
    assert.deepEqual(answerOf('Stop', '{not json', seen.deps), SILENT);
    assert.deepEqual(answerOf('Stop', JSON.stringify({ hook_event_name: 'Notification' }), seen.deps), SILENT);
    assert.deepEqual(answerOf('PostCompact', payloadOf('Stop-01-base'), seen.deps), SILENT);
    assert.deepEqual(seen.started, []);
    assert.equal(seen.logged.length, 3);
});

interface Ran {
    readonly code: number | null;
    readonly out: string;
    readonly err: string;
}

const mainWith = (event: string, payload: string, env: Record<string, string>): Ran => {
    const ran = spawnSync(process.execPath, [MAIN, event], { input: payload, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', HOME: '/nonexistent', ...env } });
    return { code: ran.status, out: ran.stdout, err: ran.stderr };
};

async function eventually(check: () => boolean): Promise<void> {
    for (let tries = 0; tries < 200 && !check(); tries += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 25); });
    }
}

test('main, piped a Stop payload: exit 0, nothing on stdout, and the runner starts detached with the session', async () => {
    const dir = scratch();
    try {
        const stateDir = join(dir, 'state');
        const ran = mainWith('Stop', payloadOf('Stop-02-base'), { SESSION_LEDGER_STATE_DIR: stateDir, SESSION_LEDGER_RUNNER: FAKE_RUNNER });
        assert.deepEqual(ran, { code: 0, out: '', err: '' });
        const calls = join(stateDir, 'fake-runner.jsonl');
        await eventually(() => existsSync(calls));
        const call = JSON.parse(readFileSync(calls, 'utf8').trim()) as { args: string[]; pid: number; sid: number };
        assert.equal(call.sid, call.pid, 'the runner leads its own session');
        assert.deepEqual(call.args, ['fx-Stop-2', '/home/user/.claude/projects/p/fx-Stop-2.jsonl', '/home/user/.cache/tmp/-home-user-Work/fx-Stop-2/scratchpad/stop3.DWJO']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('main, piped a SessionStart compact payload over a kept ledger: exit 0 and exactly the context JSON on stdout', async () => {
    const { host } = await keptLedger('fx-SessionStart-compact');
    try {
        const ran = mainWith('SessionStart', payloadOf('hand-SessionStart-compact'), { SESSION_LEDGER_STATE_DIR: host.stateDir });
        assert.equal(ran.code, 0);
        assert.equal(ran.err, '');
        const parsed = JSON.parse(ran.out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
        assert.equal(ran.out, contextJson(parsed.hookSpecificOutput.additionalContext));
        assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
        assert.equal(FORBIDDEN.test(parsed.hookSpecificOutput.additionalContext), false);
        assert.equal(TOOLING.test(parsed.hookSpecificOutput.additionalContext), false);
    } finally {
        host.dispose();
    }
});

test('main never fails the hook: an internal error exits 0 silently', () => {
    const dir = scratch();
    try {
        const stateFile = join(dir, 'state');
        writeFileSync(stateFile, 'a file where the state folder should be');
        assert.deepEqual(mainWith('Stop', payloadOf('Stop-01-base'), { SESSION_LEDGER_STATE_DIR: stateFile, SESSION_LEDGER_RUNNER: FAKE_RUNNER }), { code: 0, out: '', err: '' });
        assert.deepEqual(mainWith('Stop', '{', { SESSION_LEDGER_STATE_DIR: join(dir, 'other') }), { code: 0, out: '', err: '' });
        assert.match(readFileSync(join(dir, 'other', LOG_FILE), 'utf8'), /payload refused \(malformed/u);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
