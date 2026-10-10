// The event stream: each event written once on its lane's pane (or a workspace), sequence numbers whole and from the daemon's start, never reused
// (not even after a restart, or after a target is forgotten), cleared when the setting goes off, and nothing while off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStream, recapWritten } from '#src/recap/application/lane-events.ts';
import { EVENT_TOKEN, VALUE_MAX } from '#src/recap/domain/event-token.ts';
import type { EventKind } from '#src/recap/domain/event-token.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Done } from '#src/ports/columns.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { WorkspaceTokens, WorkspacesResult } from '#src/ports/workspace-tokens.ts';

interface Sent { readonly target: string; readonly value: string | null }

interface Rig {
    stream: EventStream;
    readonly panes: Sent[];
    readonly spaces: Sent[];
    readonly logged: string[];
    on: boolean;
    failing: boolean;
}

function rigAt(startedAt: number, workspaces: readonly string[] = ['w1', 'w2']): Rig {
    const rig: Rig = { stream: undefined as unknown as EventStream, panes: [], spaces: [], logged: [], on: true, failing: false };
    const tokens: LaneTokens = {
        report: async (pane, values): Promise<Done> => {
            rig.panes.push({ target: pane, value: values[EVENT_TOKEN] ?? null });
            return rig.failing ? unknown({ why: 'unreachable', detail: 'fake' }) : { kind: 'done' };
        },
    };
    const ws: WorkspaceTokens = {
        reportWorkspace: async (workspace, values): Promise<Done> => {
            // a write takes a moment: it is recorded only once it has landed, so a caller that does not wait for it sees nothing
            await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
            rig.spaces.push({ target: workspace, value: values[EVENT_TOKEN] ?? null });
            return rig.failing ? unknown({ why: 'unreachable', detail: 'fake' }) : { kind: 'done' };
        },
        workspaces: async (): Promise<WorkspacesResult> => ({ kind: 'workspaces', ids: workspaces }),
    };
    rig.stream = new EventStream({ tokens, workspaces: ws, enabled: (): boolean => rig.on, startedAt, log: (line: string): void => { rig.logged.push(line); } });
    return rig;
}

const flush = (): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, 20); });
const base36 = (n: number): string => n.toString(36);

test('each lane event is written once on the lane\'s pane, as `<seq>:<kind>[:<detail>]`; the sequence rises by one per pane', async () => {
    const rig = rigAt(36 ** 3);
    rig.stream.lane('w1:p1', 'recap-written', 'turn-ended');
    rig.stream.lane('w1:p1', 'autocompact-skipped', 'in-flight');
    rig.stream.lane('w1:p2', 'lane-closed', 'w1:p9');
    await flush();
    assert.deepEqual(rig.panes, [
        { target: 'w1:p1', value: `${base36(36 ** 3)}:recap-written:turn-ended` },
        { target: 'w1:p1', value: `${base36(36 ** 3 + 1)}:autocompact-skipped:in-flight` },
        { target: 'w1:p2', value: `${base36(36 ** 3)}:lane-closed:w1:p9` },
    ]);
});

test('a fractional start is cut: the sequence is a whole base-36 number, never a fraction', async () => {
    const rig = rigAt(1_791_588_357_397.8179);
    rig.stream.lane('w1:p1', 'lane-closed');
    rig.stream.lane('w1:p1', 'lane-closed');
    await flush();
    const [first, second] = rig.panes.map((sent) => sent.value?.split(':')[0] ?? '');
    assert.match(first ?? '', /^[0-9a-z]+$/u);
    assert.equal(first, base36(1_791_588_357_397));
    assert.equal(second, base36(1_791_588_357_398));
});

test('every kind is written as given, and the value never exceeds 80 characters', async () => {
    const kinds: EventKind[] = ['recap-written', 'needs-raised', 'needs-cleared', 'compact-queued', 'compact-running', 'compact-done', 'compact-failed', 'autocompact-decided', 'autocompact-skipped', 'lane-closed'];
    const rig = rigAt(1_000_000);
    for (const kind of kinds) rig.stream.lane('w1:p1', kind, 'x'.repeat(200));
    await flush();
    assert.equal(rig.panes.length, kinds.length, 'one write per logged event');
    assert.ok(rig.panes.every((sent) => (sent.value ?? '').length <= VALUE_MAX));
    assert.deepEqual(rig.panes.map((sent) => sent.value?.split(':')[1]), kinds);
});

test('off: nothing is written, for a lane or a workspace', async () => {
    const rig = rigAt(1_000_000);
    rig.on = false;
    rig.stream.lane('w1:p1', 'lane-closed');
    rig.stream.inWorkspace('w1', 'lane-closed', 'w1:p1');
    await rig.stream.daemon('daemon-started', '2.2.1');
    await flush();
    assert.deepEqual([rig.panes, rig.spaces], [[], []]);
});

test('the daemon\'s start and stop go to every workspace, as the workspace token, and are awaited', async () => {
    const rig = rigAt(36 ** 3, ['w1', 'w2']);
    await rig.stream.daemon('daemon-started', '2.2.1');
    await rig.stream.daemon('daemon-stopping', '2.2.1');
    assert.deepEqual(rig.spaces.map((sent) => sent.target), ['w1', 'w2', 'w1', 'w2'], 'every write has landed by the time the call returns');
    assert.equal(rig.spaces[0]?.value, `${base36(36 ** 3)}:daemon-started:2.2.1`);
    assert.equal(rig.spaces[2]?.value, `${base36(36 ** 3 + 1)}:daemon-stopping:2.2.1`);
});

test('a workspace report that fails is logged, not dropped', async () => {
    const rig = rigAt(1_000_000, ['w1']);
    rig.failing = true;
    await rig.stream.daemon('daemon-stopping', '2.2.1');
    assert.equal(rig.logged.length, 1);
    assert.match(rig.logged[0] ?? '', /not written/u);
});

test('a restart never reuses a sequence number: the next daemon starts later, so its numbers are above the last one', async () => {
    const first = rigAt(1_000_000);
    const second = rigAt(1_000_000 + 60_000);
    for (let n = 0; n < 500; n += 1) first.stream.lane('w1:p1', 'lane-closed');
    second.stream.lane('w1:p1', 'lane-closed');
    await flush();
    const seqOf = (sent: Sent): number => Number.parseInt(sent.value?.split(':')[0] ?? '', 36);
    const last = Math.max(...first.panes.map(seqOf));
    assert.ok(seqOf(second.panes[0] as Sent) > last, 'the restarted daemon is above every number of the first');
});

test('a pane forgotten by prune starts again from now, above every number it used: no number is reused', async () => {
    const rig = rigAt(1_000);
    rig.stream.lane('w1:p1', 'lane-closed');
    rig.stream.lane('w1:p1', 'lane-closed');
    await flush();
    rig.stream.prune(Date.now() + 7_200_000);
    rig.stream.lane('w1:p1', 'lane-closed');
    await flush();
    const seqOf = (sent: Sent): number => Number.parseInt(sent.value?.split(':')[0] ?? '', 36);
    const used = rig.panes.map(seqOf);
    assert.ok(seqOf(rig.panes[2] as Sent) > Math.max(...used.slice(0, 2)));
});

test('turning the setting off clears the event tokens: on every pane that carried one, and every workspace', async () => {
    const rig = rigAt(1_000_000, ['w1', 'w2']);
    rig.stream.lane('w1:p1', 'recap-written', 'turn-ended');
    rig.stream.inWorkspace('w1', 'lane-closed', 'w1:p9');
    await flush();
    rig.stream.tick();
    rig.on = false;
    rig.stream.tick();
    await flush();
    const cleared = rig.panes.filter((sent) => sent.value === null).map((sent) => sent.target);
    const spaces = rig.spaces.filter((sent) => sent.value === null).map((sent) => sent.target);
    assert.deepEqual(cleared, ['w1:p1']);
    assert.deepEqual(spaces.toSorted(), ['w1', 'w2'], 'the workspace that carried one, and every listed one');
});

test('a recap written at the end of a turn is told to each lane of its tab; an imported one is not a new recap', async () => {
    const rig = rigAt(1_000_000);
    recapWritten(rig.stream, [{ pane: 'w1:p1' }, { pane: 'w1:p2' }], 'turn-ended');
    recapWritten(rig.stream, [{ pane: 'w1:p1' }], 'imported');
    await flush();
    assert.deepEqual(rig.panes.map((sent) => [sent.target, (sent.value ?? '').split(':').slice(1).join(':')]), [['w1:p1', 'recap-written:turn-ended'], ['w1:p2', 'recap-written:turn-ended']]);
});

test('a workspace that cannot be listed is logged, and nothing is written for it', async () => {
    const logged: string[] = [];
    const ws: WorkspaceTokens = {
        reportWorkspace: async (): Promise<Done> => ({ kind: 'done' }),
        workspaces: async (): Promise<WorkspacesResult> => unknown({ why: 'unreachable', detail: 'fake' }),
    };
    const stream = new EventStream({ tokens: { report: async (): Promise<Done> => ({ kind: 'done' }) }, workspaces: ws, enabled: (): boolean => true, startedAt: 1, log: (line: string): void => { logged.push(line); } });
    await stream.daemon('daemon-started', '2.2.1');
    assert.equal(logged.length, 1);
});
