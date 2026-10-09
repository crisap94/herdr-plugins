// The event stream: each event written once on its lane's pane (or each workspace), sequence numbers from the daemon's start and never reused, nothing while off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HerdrEvents, recapWritten } from '#src/recap/application/lane-events.ts';
import { EVENT_TOKEN, VALUE_MAX } from '#src/recap/domain/event-token.ts';
import type { EventKind } from '#src/recap/domain/event-token.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Done } from '#src/ports/columns.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { WorkspaceTokens, WorkspacesResult } from '#src/ports/workspace-tokens.ts';

interface Sent { readonly target: string; readonly value: string }

interface Sink { readonly sink: HerdrEvents; readonly panes: Sent[]; readonly spaces: Sent[]; readonly logged: string[] }

function sinkOf(enabled: boolean, startedAt: number, workspaces: readonly string[] = ['w1', 'w2']): Sink {
    const panes: Sent[] = [];
    const spaces: Sent[] = [];
    const logged: string[] = [];
    const tokens: LaneTokens = {
        report: async (pane, values): Promise<Done> => { panes.push({ target: pane, value: values[EVENT_TOKEN] ?? '' }); return { kind: 'done' }; },
    };
    const ws: WorkspaceTokens = {
        reportWorkspace: async (workspace, values): Promise<Done> => { spaces.push({ target: workspace, value: values[EVENT_TOKEN] ?? '' }); return { kind: 'done' }; },
        workspaces: async (): Promise<WorkspacesResult> => ({ kind: 'workspaces', ids: workspaces }),
    };
    const sink = new HerdrEvents({ tokens, workspaces: ws, enabled: (): boolean => enabled, startedAt, log: (line: string): void => { logged.push(line); } });
    return { sink, panes, spaces, logged };
}

const flush = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });

test('each lane event is written once on the lane\'s pane, as `<seq>:<kind>[:<detail>]`; the sequence rises by one per pane', async () => {
    const { sink, panes } = sinkOf(true, 36 * 36 * 36);
    sink.lane('w1:p1', 'recap-written', 'turn-ended');
    sink.lane('w1:p1', 'lane-closed');
    sink.lane('w1:p2', 'lane-closed');
    await flush();
    assert.deepEqual(panes, [
        { target: 'w1:p1', value: `${(36 ** 3).toString(36)}:recap-written:turn-ended` },
        { target: 'w1:p1', value: `${(36 ** 3 + 1).toString(36)}:lane-closed` },
        { target: 'w1:p2', value: `${(36 ** 3).toString(36)}:lane-closed` },
    ]);
});

test('every kind of the table is written as given, and the value never exceeds 80 characters', async () => {
    const kinds: EventKind[] = ['recap-written', 'needs-raised', 'needs-cleared', 'compact-queued', 'compact-running', 'compact-done', 'compact-failed', 'autocompact-decided', 'autocompact-skipped', 'lane-closed'];
    const { sink, panes } = sinkOf(true, 1_000_000);
    for (const kind of kinds) sink.lane('w1:p1', kind, 'x'.repeat(200));
    await flush();
    assert.equal(panes.length, kinds.length, 'one write per logged event');
    assert.ok(panes.every((sent) => sent.value.length <= VALUE_MAX));
    assert.deepEqual(panes.map((sent) => sent.value.split(':')[1]), kinds);
});

test('off: nothing is written, for a lane or a daemon event', async () => {
    const { sink, panes, spaces } = sinkOf(false, 1_000_000);
    sink.lane('w1:p1', 'lane-closed');
    await sink.daemon('daemon-started', '2.2.1');
    await flush();
    assert.deepEqual([panes, spaces], [[], []]);
});

test('the daemon\'s start and stop go to every workspace, as the workspace token', async () => {
    const { sink, spaces } = sinkOf(true, 36 * 36 * 36, ['w1', 'w2']);
    await sink.daemon('daemon-started', '2.2.1');
    await sink.daemon('daemon-stopping', '2.2.1');
    await flush();
    assert.deepEqual(spaces.map((sent) => sent.target), ['w1', 'w2', 'w1', 'w2']);
    assert.equal(spaces[0]?.value, `${(36 ** 3).toString(36)}:daemon-started:2.2.1`);
    assert.equal(spaces[2]?.value, `${(36 ** 3 + 1).toString(36)}:daemon-stopping:2.2.1`);
});

test('a restart never reuses a sequence number: the next daemon starts later, so its numbers are above the last one', async () => {
    const first = sinkOf(true, 1_000_000);
    const second = sinkOf(true, 1_000_000 + 60_000);
    for (let n = 0; n < 500; n += 1) first.sink.lane('w1:p1', 'lane-closed');
    second.sink.lane('w1:p1', 'lane-closed');
    await flush();
    const seqOf = (sent: Sent): number => Number.parseInt(sent.value.split(':')[0] ?? '', 36);
    const last = Math.max(...first.panes.map(seqOf));
    assert.ok(seqOf(second.panes[0] as Sent) > last, 'the restarted daemon is above every number of the first');
});

test('a workspace that cannot be listed is logged, and nothing is written for it', async () => {
    const panes: Sent[] = [];
    const logged: string[] = [];
    const ws: WorkspaceTokens = {
        reportWorkspace: async (): Promise<Done> => ({ kind: 'done' }),
        workspaces: async (): Promise<WorkspacesResult> => unknown({ why: 'unreachable', detail: 'fake' }),
    };
    const tokens: LaneTokens = { report: async (pane, values): Promise<Done> => { panes.push({ target: pane, value: values[EVENT_TOKEN] ?? '' }); return { kind: 'done' }; } };
    const sink = new HerdrEvents({ tokens, workspaces: ws, enabled: (): boolean => true, startedAt: 1, log: (line: string): void => { logged.push(line); } });
    await sink.daemon('daemon-started', '2.2.1');
    assert.equal(logged.length, 1);
    assert.deepEqual(panes, []);
});

test('a recap written at the end of a turn is told to each lane of its tab; an imported one is not a new recap', async () => {
    const { sink, panes } = sinkOf(true, 1_000_000);
    recapWritten(sink, [{ pane: 'w1:p1' }, { pane: 'w1:p2' }], 'turn-ended');
    recapWritten(sink, [{ pane: 'w1:p1' }], 'imported');
    await flush();
    assert.deepEqual(panes.map((sent) => [sent.target, sent.value.split(':').slice(1).join(':')]), [['w1:p1', 'recap-written:turn-ended'], ['w1:p2', 'recap-written:turn-ended']]);
});
