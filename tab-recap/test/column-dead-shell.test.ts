import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { resetHerdrClients } from '#src/adapters/herdr/client.ts';
import { HerdrFleetPorts } from '#src/adapters/herdr/fleet.ts';
import { reconciliationOf } from '#src/adapters/herdr/snapshot-reading.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { columnOpenedObservation } from '#test/support/seen.ts';

type Raw = Record<string, unknown>;

const pane = (id: string, title: string | null, extra: Raw = {}): Raw =>
    ({ pane_id: id, tab_id: 'w1:t1', terminal_title_stripped: title, agent: null, label: 'Recap', ...extra });
const agentPane = pane('w1:p1', 'claude', { agent: 'claude', label: null });
const agents = [{ pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_status: 'idle' }];

interface Played { readonly board: Board; readonly intents: readonly Intent[] }

const reconcile = (board: Board, panes: Raw[], at: number, seenAgents: Raw[] = agents): Played => {
    const outcome = observe(board, { kind: 'reconciled', seen: reconciliationOf({ panes, agents: seenAgents, layouts: [] }) }, instant(at), DEFAULT_POLICY);
    return { board: outcome.board, intents: outcome.intents };
};

const opened = (board: Board, column: string, at: number): Board =>
    observe(board, columnOpenedObservation({ kind: 'column-opened', tab: tabId('w1:t1'), pane: paneId(column), shape: 'side', at }), instant(at), DEFAULT_POLICY).board;

const columnIntents = (intents: readonly Intent[]): string[] => intents.flatMap((intent) => {
    switch (intent.kind) {
        case 'close-column': return [`close ${String(intent.column)}`];
        case 'open-column': return [`open ${String(intent.tab)}`];
        case 'give-up': return [`give-up ${String(intent.tab)}`];
        default: return [];
    }
});

const grace = Number(DEFAULT_POLICY.closeGrace);

for (const label of ['Recap', null]) {
    test(`a column whose process exits leaves a shell that is closed after closeGrace and the column reopens (label ${String(label)})`, () => {
        const start = opened(reconcile(emptyBoard(), [agentPane], 0).board, 'w1:p2', 1000);
        const adopted = reconcile(start, [agentPane, pane('w1:p2', 'tab-recap', { label })], 2000);
        assert.deepEqual(columnIntents(adopted.intents), []);
        const early = reconcile(adopted.board, [agentPane, pane('w1:p2', 'zsh', { label })], 1000 + grace - 1);
        assert.deepEqual(columnIntents(early.intents), [], 'within closeGrace the shell is left alone');
        const late = reconcile(early.board, [agentPane, pane('w1:p2', 'zsh', { label })], 1000 + grace);
        assert.deepEqual(columnIntents(late.intents), ['close w1:p2', 'open w1:t1']);
        const again = reconcile(late.board, [agentPane, pane('w1:p2', 'zsh', { label })], 2000 + grace);
        assert.deepEqual(columnIntents(again.intents), [], 'closed once, not again while herdr closes it');
    });
}

test('a column just opened that has not painted its title yet is not closed', () => {
    const start = opened(reconcile(emptyBoard(), [agentPane], 0).board, 'w1:p2', 1000);
    for (const label of ['Recap', null]) {
        assert.deepEqual(columnIntents(reconcile(start, [agentPane, pane('w1:p2', null, { label })], 2000).intents), []);
        assert.deepEqual(columnIntents(reconcile(start, [agentPane, pane('w1:p2', 'zsh', { label })], 2000).intents), []);
    }
});

test('a restarted daemon closes a Recap shell it finds and opens one column for the tab', () => {
    const played = reconcile(emptyBoard(), [agentPane, pane('w1:p2', 'zsh')], 1000);
    assert.deepEqual(columnIntents(played.intents).toSorted(), ['close w1:p2', 'open w1:t1']);
});

test('a shell that now hosts an agent is never closed', () => {
    const start = opened(reconcile(emptyBoard(), [agentPane], 0).board, 'w1:p2', 1000);
    const panes = [agentPane, pane('w1:p2', 'claude', { agent: 'claude' })];
    const seenAgents = [...agents, { ...agents[0], pane_id: 'w1:p2' }];
    const played = reconcile(start, panes, 1000 + grace * 2, seenAgents);
    assert.ok(!columnIntents(played.intents).includes('close w1:p2'));
    assert.ok(!columnIntents(reconcile(emptyBoard(), panes, 1000, seenAgents).intents).includes('close w1:p2'));
});

test('a beside relay titled tab-recap:relay is never closed', () => {
    const played = reconcile(emptyBoard(), [agentPane, pane('w1:p2', 'tab-recap'), pane('w1:p3', 'tab-recap:relay')], 1000);
    assert.deepEqual(columnIntents(played.intents), []);
});

test('a column that keeps dying gives up after reopenLimit', () => {
    let board = reconcile(emptyBoard(), [agentPane], 0).board;
    const seen: string[] = [];
    for (let round = 0; round < DEFAULT_POLICY.reopenLimit; round += 1) {
        const id = `w1:p${round + 2}`;
        const at = 1000 + round * (grace + 2000);
        board = opened(board, id, at);
        const played = reconcile(board, [agentPane, pane(id, 'zsh')], at + grace);
        board = played.board;
        seen.push(...columnIntents(played.intents));
    }
    assert.deepEqual(seen, ['close w1:p2', 'open w1:t1', 'close w1:p3', 'open w1:t1', 'close w1:p4', 'give-up w1:t1']);
});

test('HerdrFleetPorts.closeEvery closes Recap shells too, never an agent pane or a relay', async () => {
    const snapshot = {
        panes: [agentPane, pane('w1:p2', 'tab-recap'), pane('w1:p3', 'zsh'), pane('w1:p4', 'tab-recap:relay'), pane('w1:p5', 'zsh', { label: null }), pane('w1:p6', 'zsh', { agent: 'codex' })],
        agents,
    };
    const dir = mkdtempSync(join(tmpdir(), 'recap-herdr-'));
    const path = join(dir, 'herdr.sock');
    const closed: unknown[] = [];
    const server = createServer((socket) => {
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            for (const line of chunk.split('\n').filter((entry) => entry !== '')) {
                const request: { id: string; method: string; params?: { pane_id?: unknown } } = JSON.parse(line);
                if (request.method === 'pane.close') {
                    closed.push(request.params?.pane_id);
                }
                const replies: Record<string, unknown> = { ping: { protocol: PROTOCOL, version: 'test' }, 'session.snapshot': { snapshot } };
                const result = replies[request.method] ?? {};
                socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
            }
        });
    });
    await new Promise<void>((resolve) => { server.listen(path, resolve); });
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = path;
    resetHerdrClients();
    try {
        assert.deepEqual(await new HerdrFleetPorts(textOf('/state')).closeEvery(), { kind: 'closed', closed: 2, failed: 0 });
        assert.deepEqual(closed, ['w1:p2', 'w1:p3']);
    } finally {
        resetHerdrClients();
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
        resetHerdrClients();
        server.close();
        rmSync(dir, { recursive: true });
    }
});
