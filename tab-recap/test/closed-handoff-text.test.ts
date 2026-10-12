import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedFreshnessOf } from '#src/recap/application/freshness-block.ts';
import type { ClosedView } from '#src/recap/application/closed-view.ts';
import type { ClosedLaneRecord } from '#src/ports/closed-lanes.ts';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import { serializeClosedListing } from '#src/recap/render/closed-listing.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { directoryOf, taskNameOf } from './fakes/closed-values.ts';

const CLOSED_AT = instant(Date.parse('2026-10-11T09:00:00Z'));
const DEL = 127;
const SPACE = 32;
const isControl = (code: number): boolean => code < SPACE || code === DEL;
const RUN = { at: Date.parse('2026-10-11T08:30:00Z'), cause: 'turn-ended' as const };
const VIEW: ClosedView = { closedAt: CLOSED_AT, agent: agentKind('claude'), cwd: directoryOf('/work/tree'), run: RUN };

test('a closed freshness says closed at the close instant in place of the lane status, and its newer prompts are unknown', () => {
    const outcome = closedFreshnessOf(VIEW);
    const freshness = outcome.kind === 'fresh' ? outcome.freshness : assert.fail('the closed view has a run, so it is fresh');
    const text = freshnessTextOf(freshness, CLOSED_AT);
    assert.match(text, /closed at 2026-10-11 09:00Z/);
    assert.doesNotMatch(text, /lane status/);
    assert.match(text, /newer prompts: unknown/);
});

test('a live freshness text is unchanged when no close instant is given', () => {
    const text = freshnessTextOf({ lastRun: RUN, status: 'idle', newerPrompts: { kind: 'none' }, refresh: 'not-requested' });
    assert.match(text, /lane status: idle/);
    assert.doesNotMatch(text, /closed at/);
});

test('a closed view whose last run at the close is missing is ledger-empty', () => {
    assert.deepEqual(closedFreshnessOf({ ...VIEW, run: null }), { kind: 'ledger-empty' });
});

function record(pane: string, closedAt: number, name: string | null): ClosedLaneRecord {
    return {
        tab: tabId('w1:t1'),
        pane: paneId(pane),
        agent: agentKind('claude'),
        closedAt: instant(closedAt),
        cwd: null,
        association: name === null ? null : { task: { tab: tabId('w1:t1'), key: 'k1' }, name: taskNameOf(name) },
    };
}

test('the closed listing is one tab-separated line per identity, in the order given, with the task name last', () => {
    const text = serializeClosedListing([record('w1:p1', 2000, 'alpha'), record('w1:p1', 1000, null)]);
    assert.equal(text, 'w1:p1\tclaude\t2000\talpha\nw1:p1\tclaude\t1000\t');
});

test('a task name with an escape sequence or a newline is printed without a control character', () => {
    const text = serializeClosedListing([record('w1:p1', 1000, 'bad\u001b[31m\nname')]);
    const controls = Array.from(text).filter((character) => character !== '\t' && isControl(character.codePointAt(0) ?? 0));
    assert.deepEqual(controls, []);
    assert.equal(text.split('\t').length, 4);
});

test('no closed lane prints nothing', () => {
    assert.equal(serializeClosedListing([]), '');
});
