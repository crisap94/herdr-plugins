// A lane's session follows herdr: a detection with no session keeps the one the lane held, and a `session` observation makes the lane hold the
// session herdr reports now (a new agent's, or a resumed agent's). Neither asks for an intent: the transcript read is what follows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Observation, Outcome } from '#src/recap/domain/fold.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';

const lane = (session: string | null, agent = 'claude'): SeenLane => ({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, status: 'idle', session });

/** A snapshot that holds the given lane and nothing else. */
const snapshot = (only: SeenLane): Observation => ({ kind: 'reconciled', seen: { focusedTab: null, lanes: [only], panes: [only.paneId], columns: [], widths: new Map() } });

function run(observations: readonly Observation[]): { board: Board; outcomes: Outcome[] } {
    let board = emptyBoard();
    const outcomes: Outcome[] = [];
    observations.forEach((observation, at) => {
        const outcome = observe(board, observation, instant(at * 1000), DEFAULT_POLICY);
        board = outcome.board;
        outcomes.push(outcome);
    });
    return { board, outcomes };
}

const sessionOf = (board: Board): string | null => {
    const held = board.lanes.get(paneId('w1:p1'));
    return held === undefined || held.session === null ? null : String(held.session);
};

test('a detection that carries no session keeps the session the lane held', () => {
    const { board } = run([{ kind: 'detected', lane: lane('S1') }, { kind: 'detected', lane: lane(null) }]);
    assert.equal(sessionOf(board), 'S1');
});

test('a brand-new agent: its detection has no session; herdr reports one on the pane, and the lane follows it silently', () => {
    const { board, outcomes } = run([{ kind: 'detected', lane: lane(null) }, { kind: 'session', pane: paneId('w1:p1'), session: 'S-new' }]);
    assert.equal(sessionOf(board), 'S-new');
    assert.deepEqual(outcomes.at(-1)?.intents, [], 'no intent: the transcript read follows the lane');
    assert.equal(outcomes.at(-1)?.watchSet, 'unchanged');
});

test('a resumed agent: the lane held the old session; herdr reports the new one, and the lane follows it', () => {
    const { board } = run([{ kind: 'detected', lane: lane('S-old') }, { kind: 'session', pane: paneId('w1:p1'), session: 'S-new' }]);
    assert.equal(sessionOf(board), 'S-new');
});

test('the same session again changes nothing; a session for a pane the board does not hold is ignored', () => {
    const { board, outcomes } = run([{ kind: 'detected', lane: lane('S1') }, { kind: 'session', pane: paneId('w1:p1'), session: 'S1' }, { kind: 'session', pane: paneId('w9:p9'), session: 'S9' }]);
    assert.deepEqual([sessionOf(board), board.lanes.has(paneId('w9:p9'))], ['S1', false]);
    assert.deepEqual(outcomes.slice(1).map((outcome) => outcome.intents), [[], []], 'the sessions ask for nothing');
});

test('a snapshot that names no session keeps the session the lane held, as a detection does', () => {
    const { board } = run([{ kind: 'detected', lane: lane('S1') }, snapshot(lane(null))]);
    assert.equal(sessionOf(board), 'S1');
});

test('a different agent in the pane is not the old one: a detection or a snapshot of it holds no session', () => {
    assert.equal(sessionOf(run([{ kind: 'detected', lane: lane('S1', 'claude') }, { kind: 'detected', lane: lane(null, 'codex') }]).board), null);
    assert.equal(sessionOf(run([{ kind: 'detected', lane: lane('S1', 'claude') }, snapshot(lane(null, 'codex'))]).board), null);
});
