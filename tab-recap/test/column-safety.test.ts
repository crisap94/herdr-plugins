import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentPanesIn, columnsIn } from '#src/adapters/column-panes.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { reconciliationOf } from '#src/adapters/herdr-json.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const pane = (id: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
    ({ pane_id: id, tab_id: 'w1:t1', terminal_title_stripped: title, agent: null, label: null, ...extra });
const none = new Set<string>();

test('columnsIn: only an EXACT title, no agent, and the manifest label when herdr reports one', () => {
    const panes = [
        pane('w1:p1', 'tab-recap', { label: 'Recap' }),
        pane('w1:p2', 'tab-recap:bar', { label: 'Recap' }),
        pane('w1:p3', 'tab-recap'),
        pane('w1:p4', 'tab-recap-harness-config', { agent: 'claude' }),
        pane('w1:p5', 'tab-recap-harness-config'),
        pane('w1:p6', 'tab-recap:bar-x'),
        pane('w1:p7', 'tab-recap', { agent: 'claude' }),
        pane('w1:p8', 'tab-recap', { label: 'My notes' }),
        pane('w1:p9', 'Tab-Recap'),
        pane('w1:p10', 'tab-recap '),
    ];
    assert.deepEqual(columnsIn(panes, none).map((c) => [c.paneId, c.shape]), [['w1:p1', 'side'], ['w1:p2', 'bar'], ['w1:p3', 'side']]);
    assert.deepEqual(columnsIn(panes, new Set(['w1:p3'])).map((c) => c.paneId), ['w1:p1', 'w1:p2'], 'the snapshot agents list is cross-checked');
});

test('agentPanesIn: the agents list and any pane carrying an agent', () => {
    const found = agentPanesIn([pane('a', 'x', { agent: 'codex' }), pane('b', 'x')], [{ pane_id: 'c' }, { pane_id: '' }]);
    assert.deepEqual([...found].toSorted(), ['a', 'c']);
});

test('a snapshot with an agent pane titled tab-recap-harness-config yields no column for it', () => {
    const reconciliation = reconciliationOf({
        panes: [pane('w1:p1', 'tab-recap-harness-config', { agent: 'claude' }), pane('w1:p2', 'tab-recap', { label: 'Recap' })],
        agents: [{ pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_status: 'idle' }],
        layouts: [],
    });
    assert.deepEqual(reconciliation.columns.map((c) => c.paneId), ['w1:p2']);
});

const lane = (id: string, agent = 'claude'): { paneId: string; tabId: string; workspaceId: string; agent: string; status: string; session: string } =>
    ({ paneId: id, tabId: 'w1:t1', workspaceId: 'w1', agent, status: 'idle', session: `s-${id}` });

function play(observations: readonly Observation[]): { board: Board; intents: Intent[] } {
    let board = emptyBoard();
    const intents: Intent[] = [];
    observations.forEach((observation, at) => {
        const outcome = observe(board, observation, instant(at * 1000), DEFAULT_POLICY);
        board = outcome.board;
        intents.push(...outcome.intents);
    });
    return { board, intents };
}

const reconciled = (lanes: ReturnType<typeof lane>[], columnPanes: string[]): Observation => ({
    kind: 'reconciled',
    seen: { focusedTab: 'w1:t1', lanes, panes: [...lanes.map((l) => l.paneId), ...columnPanes], columns: columnPanes.map((p) => ({ tabId: 'w1:t1', paneId: p, shape: 'side' as const })), widths: new Map() },
});

test('the domain never adopts an agent pane as a column, nor closes it — not even on stop', () => {
    for (const agent of ['claude', 'codex', 'opencode']) {
        // an adapter that wrongly reports the agent pane (named tab-recap-harness-config) as a column
        const { board, intents } = play([reconciled([lane('w1:p1', agent)], ['w1:p1']), { kind: 'switched', enabled: false }]);
        assert.equal(board.columns.size, 0, `${agent}: no column adopted`);
        const closes = intents.filter((intent) => intent.kind === 'close-column');
        assert.deepEqual(closes, [], `${agent}: no close-column intent`);
        assert.ok(!intents.some((intent) => intent.kind === 'open-column' && String(intent.tab) === 'x'), 'sanity');
    }
});

test('a pane the board held as a column, in which an agent then appears, becomes a lane and is never closed', () => {
    const real = { kind: 'column-opened', tab: 'w1:t1', pane: paneId('w1:p9'), shape: 'side' } as unknown as Observation;
    const { board, intents } = play([
        reconciled([lane('w1:p1')], []),
        real,
        { kind: 'detected', lane: lane('w1:p9', 'opencode') },
        { kind: 'switched', enabled: false },
    ]);
    assert.ok([...board.columns.values()].every((placed) => String(placed.pane) !== 'w1:p9'));
    assert.deepEqual(intents.filter((intent) => intent.kind === 'close-column' && String(intent.column) === 'w1:p9'), []);
});

test('a real column is still closed on stop (the guard is not a blanket no)', () => {
    const { intents } = play([reconciled([lane('w1:p1')], ['w1:p2']), { kind: 'switched', enabled: false }]);
    assert.deepEqual(intents.filter((intent) => intent.kind === 'close-column').map((intent) => String(intent.column)), ['w1:p2']);
});

/** A herdr that answers session.snapshot and records everything else it is asked. */
async function fakeHerdr(snapshot: unknown): Promise<{ server: Server; path: string; calls: string[]; done: () => void }> {
    const dir = mkdtempSync(join(tmpdir(), 'recap-herdr-'));
    const path = join(dir, 'herdr.sock');
    const calls: string[] = [];
    const server = createServer((socket) => {
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            for (const line of chunk.split('\n').filter((entry) => entry !== '')) {
                const request = JSON.parse(line) as { id: string; method: string };
                calls.push(request.method);
                const result = request.method === 'session.snapshot' ? { snapshot } : {};
                socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
            }
        });
    });
    await new Promise<void>((resolve) => { server.listen(path, resolve); });
    return { server, path, calls, done: (): void => { server.close(); rmSync(dir, { recursive: true }); } };
}

test('HerdrFleet refuses to close or resize a pane that hosts an agent — and still closes a column', async () => {
    const snapshot = {
        panes: [pane('w1:p1', 'tab-recap-harness-config', { agent: 'claude' }), pane('w1:p2', 'tab-recap', { label: 'Recap' }), pane('w1:p3', 'plain')],
        agents: [{ pane_id: 'w1:p1', agent: 'claude' }, { pane_id: 'w1:p3', agent: 'opencode' }],
    };
    const herdr = await fakeHerdr(snapshot);
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = herdr.path;
    try {
        const fleet = new HerdrFleet('/state');
        for (const target of ['w1:p1', 'w1:p3']) {
            const closed = await fleet.close(paneId(target));
            assert.ok(isUnknown(closed) && closed.why.why === 'failed', `close ${target} refused`);
            assert.ok(isUnknown(await fleet.resize(paneId(target), 'left', 0.1)), `resize ${target} refused`);
        }
        assert.ok(!herdr.calls.some((method) => method === 'pane.close' || method === 'pane.resize'), `herdr was never asked: ${herdr.calls.join()}`);
        assert.deepEqual(await fleet.close(paneId('w1:p2')), { kind: 'done' });
        assert.ok(!('swap' in fleet) && !('focus' in fleet), 'the fleet cannot swap or focus a pane at all');
        assert.ok(herdr.calls.includes('pane.close'), 'a real column is closed');
    } finally {
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
        herdr.done();
    }
});

test('HerdrFleet refuses when it cannot check: herdr unreachable means no close', async () => {
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = join(tmpdir(), 'no-such-herdr.sock');
    try {
        const closed = await new HerdrFleet('/state').close(paneId('w1:p1'));
        assert.ok(isUnknown(closed));
    } finally {
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
    }
});

test('HerdrFleet.closeEvery: ONE look at herdr, then a close for each of OUR columns — tracked or not — and never for an agent pane', async () => {
    const snapshot = {
        panes: [
            pane('w1:p1', 'tab-recap-harness-config', { agent: 'claude' }), pane('w1:p2', 'tab-recap', { label: 'Recap' }), pane('w2:p2', 'tab-recap:bar', { label: 'Recap' }),
            pane('w3:p2', 'tab-recap', { label: 'Recap' }), pane('w3:p3', 'tab-recap'), pane('w4:p1', 'tab-recap'), pane('w5:p1', 'plain'),
        ],
        agents: [{ pane_id: 'w1:p1', agent: 'claude' }, { pane_id: 'w4:p1', agent: 'opencode' }],
    };
    const herdr = await fakeHerdr(snapshot);
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = herdr.path;
    try {
        const result = await new HerdrFleet('/state').closeEvery();
        assert.deepEqual(result, { kind: 'closed', closed: 4, failed: 0 });
        assert.deepEqual(herdr.calls, ['session.snapshot', 'pane.close', 'pane.close', 'pane.close', 'pane.close'], 'one snapshot for the whole batch');
    } finally {
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
        herdr.done();
    }
});

test('HerdrFleet.closeEvery: herdr unreachable is an Unknown, not a throw', async () => {
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = join(tmpdir(), 'no-such-herdr-either.sock');
    try {
        assert.ok(isUnknown(await new HerdrFleet('/state').closeEvery()));
    } finally {
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
    }
});
