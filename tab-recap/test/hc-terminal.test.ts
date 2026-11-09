import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHcTerminal } from '#src/recap/domain/hc-terminal.ts';

const agent = (address: string, state: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    address, state: 'live', cwd: '/work', title: 'a title', labels: { 'herdr.tab': 'tb1', 'herdr.space': 'sp1', where: 'S / 1' },
    foreground: { pid: 4242, cwd: '/work/sub', name: 'claude' }, status: { app: 'claude-code', state, msg: 'doing a thing' }, ...extra,
});
const shell = (address: string): Record<string, unknown> => ({ address, state: 'live', cwd: '/', title: '', labels: { 'herdr.tab': 'tb1', 'herdr.space': 'sp1' }, status: null });

test('a terminal that reports an agent under a labelled tab is a lane; a shell, a finished one and an unlabelled one are not', () => {
    assert.equal(parseHcTerminal(agent('t1', 'working')).kind, 'ok');
    assert.equal(parseHcTerminal(shell('t2')).kind, 'err');
    assert.equal(parseHcTerminal(agent('t3', 'idle', { state: 'finished' })).kind, 'err');
    assert.equal(parseHcTerminal(agent('t4', 'idle', { labels: {} })).kind, 'err');
});

test('the cwd is the foreground one, else the terminal one; the pid comes from the foreground', () => {
    const parsed = parseHcTerminal(agent('t1', 'idle'));
    assert.ok(parsed.kind === 'ok');
    assert.equal(parsed.value.cwd, '/work/sub');
    assert.equal(parsed.value.pid, 4242);
    const bare = parseHcTerminal(agent('t1', 'idle', { foreground: null }));
    assert.ok(bare.kind === 'ok');
    assert.equal(bare.value.cwd, '/work');
    assert.equal(bare.value.pid, null);
});
