import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HerdrAgentPanes } from '#src/adapters/herdr/agents.ts';
import type { Wire } from '#src/adapters/herdr/agents.ts';
import { emptyBoard, listsPane } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { paneId } from '#test/support/ids.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { LANE_STATUSES, parseLaneStatusAtDecision } from '@stateforge-labs/session-ledger';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { CLOSE_POINTS } from '#src/recap/domain/lane-closed.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { saying } from '#src/recap/domain/saying.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { reconciliation, seenLane } from '#test/support/seen.ts';

const reconciled = (panes: readonly string[]): Observation => ({
    kind: 'reconciled',
    seen: reconciliation({ lanes: panes.map((pane) => seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle', session: `s-${pane}` })), columns: [], panes: [...panes], widths: new Map() }),
});

test('the board lists a pane until the fold has applied its closed intent', () => {
    const seen = observe(emptyBoard(), reconciled(['w1:p1', 'w1:p2']), instant(0), DEFAULT_POLICY).board;
    assert.deepEqual([listsPane(seen, paneId('w1:p1')), listsPane(seen, paneId('w1:p2')), listsPane(seen, paneId('w1:p9'))], [true, true, false]);
    const after = observe(seen, { kind: 'closed', pane: paneId('w1:p1') }, instant(1000), DEFAULT_POLICY).board;
    assert.deepEqual([listsPane(after, paneId('w1:p1')), listsPane(after, paneId('w1:p2'))], [false, true]);
});

test('the lane status at a decision is idle, done or working, and nothing else', () => {
    assert.deepEqual(LANE_STATUSES.map((status) => parseLaneStatusAtDecision(status)), ['idle', 'done', 'working']);
    for (const other of ['blocked', 'unknown', 'Idle', '', null, undefined]) {
        assert.equal(parseLaneStatusAtDecision(other), null, String(other));
    }
});

const goneWire: Wire = () => Promise.reject(Object.assign(new Error('agent.get: agent target w1:p9 not found [agent_not_found]'), { code: 'agent_not_found' }));
const silentWire: Wire = () => Promise.reject(Object.assign(new Error('socket closed'), { code: 'socket_closed' }));

test('herdr answering agent_not_found is a lane that is gone; any other failure stays unreachable', async () => {
    const gone = await new HerdrAgentPanes(goneWire, { id: textOf('tab-recap'), stateDir: textOf('/x') }).status(paneId('w1:p9'));
    assert.ok(isUnknown(gone));
    assert.equal(gone.why.why, 'not-found');
    const silent = await new HerdrAgentPanes(silentWire, { id: textOf('tab-recap'), stateDir: textOf('/x') }).status(paneId('w1:p9'));
    assert.ok(isUnknown(silent));
    assert.equal(silent.why.why, 'unreachable');
    assert.match(saying(silent.why), /socket closed/);
});

test('the closed-lane log line names a lane whose agent is not known too', () => {
    assert.match(en.compaction.laneClosed(null, textOf('w1:p1'), 'before-writer'), /^compaction: lane w1:p1 closed, skipped/u);
    assert.match(es.compaction.laneClosed(null, textOf('w1:p1'), 'before-writer'), /^compactación: carril w1:p1 se cerró, omitida/u);
});

test('the closed-lane log line names the agent, the pane and where the compaction was, in both languages', () => {
    for (const point of CLOSE_POINTS) {
        assert.match(en.compaction.laneClosed(textOf('claude'), textOf('w1:p1'), point), /^compaction: claude w1:p1 closed, skipped \(.+\)$/u, point);
        assert.match(es.compaction.laneClosed(textOf('claude'), textOf('w1:p1'), point), /^compactación: claude w1:p1 se cerró, omitida \(.+\)$/u, point);
    }
    assert.equal(new Set(CLOSE_POINTS.map((point) => en.compaction.laneClosed(textOf('a'), textOf('p'), point))).size, CLOSE_POINTS.length);
});
