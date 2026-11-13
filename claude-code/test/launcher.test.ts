import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FORBIDDEN } from '../../tab-recap/src/recap/domain/forbidden-words.ts';
import { contextJson } from '../src/hook.ts';
import { LOG_FILE } from '../src/runner.ts';
import { keptLedger, payloadOf } from './support/ledger.ts';

const ROOT = join(import.meta.dirname, '..');
const HOOK = join(ROOT, 'scripts', 'hook');
const FAKE_RUNNER = join(import.meta.dirname, 'support', 'fake-runner.ts');
const SH = '/bin/sh';
const SYSTEM_PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;

interface Ran {
    readonly code: number | null;
    readonly out: string;
    readonly err: string;
}

const hookWith = (event: string, payload: string, env: Record<string, string>): Ran => {
    const ran = spawnSync(SH, [HOOK, event], { input: payload, encoding: 'utf8', env: { PATH: SYSTEM_PATH, HOME: '/nonexistent', CLAUDE_CODE_ENTRYPOINT: 'cli', SESSION_LEDGER_RUNNER: FAKE_RUNNER, ...env } });
    return { code: ran.status, out: ran.stdout, err: ran.stderr };
};

const QUIET: Ran = { code: 0, out: '', err: '' };

async function eventually(check: () => boolean): Promise<void> {
    for (let tries = 0; tries < 200 && !check(); tries += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 25); });
    }
}

function scratch(): string {
    return mkdtempSync(join(tmpdir(), 'claude-code-launcher-'));
}

const runnerCalls = (stateDir: string): readonly string[][] => {
    const path = join(stateDir, 'fake-runner.jsonl');
    return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').map((line) => (JSON.parse(line) as { args: string[] }).args) : [];
};

test('the launcher runs a Stop through bun: exit 0, nothing printed, the runner started with the hook session', async () => {
    const dir = scratch();
    try {
        const stateDir = join(dir, 'state');
        assert.deepEqual(hookWith('Stop', payloadOf('Stop-01-base'), { SESSION_LEDGER_STATE_DIR: stateDir }), QUIET);
        await eventually(() => runnerCalls(stateDir).length > 0);
        assert.deepEqual(runnerCalls(stateDir), [['fx-Stop-1', '/home/user/.claude/projects/p/fx-Stop-1.jsonl', '/tmp/work']]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the launcher stays silent and starts nothing inside herdr, in a writer run, without bun, and in a run it cannot tell is interactive', () => {
    const dir = scratch();
    try {
        const empty = join(dir, 'empty-path');
        mkdirSync(empty);
        const cases: readonly (readonly [string, Record<string, string>])[] = [
            ['inside herdr', { HERDR_ENV: '1' }],
            ['a writer run', { SESSION_LEDGER_WRITER: '1' }],
            ['bun missing', { PATH: empty }],
            ['no entrypoint', { CLAUDE_CODE_ENTRYPOINT: '' }],
            ['a print run', { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }],
        ];
        for (const [label, env] of cases) {
            const stateDir = join(dir, label.replaceAll(' ', '-'));
            for (const [event, payload] of [['Stop', 'Stop-01-base'], ['SessionStart', 'hand-SessionStart-compact'], ['PostCompact', 'PostCompact-01-manual']] as const) {
                assert.deepEqual(hookWith(event, payloadOf(payload), { SESSION_LEDGER_STATE_DIR: stateDir, SESSION_LEDGER_PRECOMPACT: 'on', ...env }), QUIET, `${label}: ${event}`);
            }
            assert.equal(existsSync(stateDir), false, `${label}: nothing is written`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('SESSION_LEDGER_HEADLESS=on follows a run the launcher cannot tell is interactive', async () => {
    const dir = scratch();
    try {
        const stateDir = join(dir, 'state');
        assert.deepEqual(hookWith('Stop', payloadOf('Stop-01-base'), { SESSION_LEDGER_STATE_DIR: stateDir, CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', SESSION_LEDGER_HEADLESS: 'on' }), QUIET);
        await eventually(() => runnerCalls(stateDir).length > 0);
        assert.equal(runnerCalls(stateDir).length, 1);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the launcher prints the context JSON after a compaction, and nothing for a startup', async () => {
    const { host } = await keptLedger('fx-SessionStart-compact');
    try {
        const ran = hookWith('SessionStart', payloadOf('hand-SessionStart-compact'), { SESSION_LEDGER_STATE_DIR: host.stateDir });
        assert.equal(ran.code, 0);
        assert.equal(ran.err, '');
        const parsed = JSON.parse(ran.out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
        assert.equal(ran.out, contextJson(parsed.hookSpecificOutput.additionalContext));
        assert.equal(FORBIDDEN.test(parsed.hookSpecificOutput.additionalContext), false);
        assert.deepEqual(hookWith('SessionStart', payloadOf('SessionStart-01-startup'), { SESSION_LEDGER_STATE_DIR: host.stateDir }), QUIET);
    } finally {
        host.dispose();
    }
});

test('PreCompact is skipped by the launcher itself unless SESSION_LEDGER_PRECOMPACT=on, then prints one line', async () => {
    const { host } = await keptLedger('fx-PreCompact-1');
    try {
        assert.deepEqual(hookWith('PreCompact', payloadOf('PreCompact-01-manual'), { SESSION_LEDGER_STATE_DIR: host.stateDir }), QUIET);
        assert.equal(existsSync(join(host.stateDir, LOG_FILE)), false);
        const ran = hookWith('PreCompact', payloadOf('PreCompact-01-manual'), { SESSION_LEDGER_STATE_DIR: host.stateDir, SESSION_LEDGER_PRECOMPACT: 'on' });
        assert.equal(ran.code, 0);
        assert.match(ran.out, /^When you summarize this conversation, keep these, most important first: \(1\) [^\n]+$/u);
    } finally {
        host.dispose();
    }
});

test('the launcher never fails the hook: a broken payload, a state folder that is a file and a crashing bun all end in exit 0 with nothing printed', () => {
    const dir = scratch();
    try {
        const stateDir = join(dir, 'state');
        assert.deepEqual(hookWith('Stop', '{', { SESSION_LEDGER_STATE_DIR: stateDir }), QUIET);
        assert.match(readFileSync(join(stateDir, LOG_FILE), 'utf8'), /payload refused/u);
        const stateFile = join(dir, 'file');
        writeFileSync(stateFile, '');
        assert.deepEqual(hookWith('Stop', payloadOf('Stop-01-base'), { SESSION_LEDGER_STATE_DIR: stateFile }), QUIET);
        const fakeBin = join(dir, 'bin');
        mkdirSync(fakeBin);
        writeFileSync(join(fakeBin, 'bun'), '#!/bin/sh\necho crashed >&2\nexit 9\n', { mode: 0o755 });
        const crashed = join(dir, 'crashed');
        assert.deepEqual(hookWith('Stop', payloadOf('Stop-01-base'), { SESSION_LEDGER_STATE_DIR: crashed, PATH: `${fakeBin}:/usr/bin:/bin` }), QUIET);
        assert.match(readFileSync(join(crashed, LOG_FILE), 'utf8'), /crashed/u);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the plugin declares the four hooks through the launcher, Stop and PostCompact async, and names no reserved plugin name', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')) as { name: string };
    assert.equal(manifest.name, 'session-ledger');
    assert.doesNotMatch(manifest.name, /^(claude|anthropic|cc-plugin)-|^claude-code$/u);
    type Handler = { type: string; command: string; async?: boolean; timeout?: number };
    const hooks = (JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8')) as { hooks: Record<string, { matcher?: string; hooks: Handler[] }[]> }).hooks;
    assert.deepEqual(Object.keys(hooks).toSorted(), ['PostCompact', 'PreCompact', 'SessionStart', 'Stop']);
    for (const [event, groups] of Object.entries(hooks)) {
        const [handler] = groups.flatMap((group) => group.hooks);
        assert.equal(handler?.type, 'command', event);
        assert.equal(handler?.command, `sh "\${CLAUDE_PLUGIN_ROOT}/scripts/hook" ${event}`, event);
        assert.equal(handler?.async === true, event === 'Stop' || event === 'PostCompact', event);
    }
    assert.equal(hooks['SessionStart']?.[0]?.matcher, 'compact|resume');
    assert.equal(existsSync(join(ROOT, 'bin')), false);
});
