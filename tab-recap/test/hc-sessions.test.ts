import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeSessions } from '#src/adapters/hc-sessions.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { parseHcTerminal } from '#src/recap/domain/hc-terminal.ts';

const agent = (address: string, state: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    address, state: 'live', cwd: '/work', title: 'a title', labels: { 'herdr.tab': 'tb1', 'herdr.space': 'sp1', where: 'S / 1' },
    foreground: { pid: 4242, cwd: '/work/sub', name: 'claude' }, status: { app: 'claude-code', state, msg: 'doing a thing' }, ...extra,
});

test('a claude lane gets its session from the pid file; another agent, a missing file and no home get none', () => {
    const home = mkdtempSync(join(tmpdir(), 'hc-claude-'));
    mkdirSync(join(home, 'sessions'));
    writeFileSync(join(home, 'sessions', '4242.json'), JSON.stringify({ pid: 4242, sessionId: 'abc-123' }));
    const root = parseDirectory(home);
    assert.ok(root.kind === 'ok');
    const terminal = parseHcTerminal(agent('t1', 'idle'));
    assert.ok(terminal.kind === 'ok');
    assert.equal(claudeSessions(root.value)(terminal.value), 'abc-123');
    assert.equal(claudeSessions(null)(terminal.value), null);
    const other = parseHcTerminal(agent('t2', 'idle', { status: { app: 'opencode', state: 'idle' } }));
    assert.ok(other.kind === 'ok');
    assert.equal(claudeSessions(root.value)(other.value), null);
    const gone = parseHcTerminal(agent('t3', 'idle', { foreground: { pid: 1, cwd: '/' } }));
    assert.ok(gone.kind === 'ok');
    assert.equal(claudeSessions(root.value)(gone.value), null);
});
