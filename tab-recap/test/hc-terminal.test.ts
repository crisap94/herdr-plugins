import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '#src/protocol/result.ts';
import { parseAgentKind } from '#src/recap/domain/ids.ts';
import { parseHcTerminal } from '#src/adapters/herdr-core/sdk-core.ts';
import { seenOfHcTerminal } from '#src/adapters/herdr-core/seen.ts';

test('an SDK terminal maps to a lane with its ids, status, title and foreground cwd, and no session when none is given', () => {
    const parsed = parseHcTerminal({
        address: 't1', state: 'live', cwd: '/work', title: 'a title', labels: { 'herdr.tab': 'tb1', 'herdr.space': 'sp1' },
        foreground: { pid: 4242, cwd: '/work/sub' }, status: { app: 'claude-code', state: 'working' },
    });
    assert.ok(parsed.kind === 'ok');
    assert.deepEqual(seenOfHcTerminal(parsed.value, null, must(parseAgentKind('claude'))), {
        paneId: 't1', tabId: 'tb1', workspaceId: 'sp1', agent: 'claude', status: 'working', session: null, cwd: '/work/sub', title: 'a title',
    });
});
