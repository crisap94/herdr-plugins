import { test } from 'node:test';
import { paneId } from '#test/support/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import assert from 'node:assert/strict';
import { EventStream, recapWritten } from '#src/recap/application/lane-events.ts';
import { EVENT_TOKEN } from '#src/recap/domain/event-token.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import type { Done } from '#src/ports/columns.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { WorkspaceList, WorkspaceTokenReporter } from '#src/ports/workspace-tokens.ts';
import { parseTokenName } from '#src/protocol/primitives.ts';
import { must } from '@stateforge-labs/session-ledger';
import { uncheckedWorkspaceId } from '#src/recap/domain/ids.ts';

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
    const tokens: LaneTokenReporter = {
        report: async (pane, values): Promise<Done> => {
            rig.panes.push({ target: pane, value: Object.fromEntries(values)[EVENT_TOKEN] ?? null });
            return rig.failing ? unknown({ why: 'unreachable', detail: causeOf('fake') }) : { kind: 'done' };
        },
    };
    const ws: WorkspaceTokenReporter = {
        reportWorkspace: async (workspace, values): Promise<Done> => {
            await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
            rig.spaces.push({ target: workspace, value: values.get(must(parseTokenName(EVENT_TOKEN))) ?? null });
            return rig.failing ? unknown({ why: 'unreachable', detail: causeOf('fake') }) : { kind: 'done' };
        },
        workspaces: async (): Promise<WorkspaceList> => ({ kind: 'workspaces', ids: workspaces.map((id) => uncheckedWorkspaceId(id)) }),
    };
    rig.stream = new EventStream({ tokens, workspaces: ws, enabled: (): Presence => (rig.on ? 'present' : 'absent'), startedAt: instant(startedAt), log: (line: string): void => { rig.logged.push(line); } });
    return rig;
}

const flush = (): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, 20); });

test('a recap written at the end of a turn is told to each lane of its tab; an imported one is not a new recap', async () => {
    const rig = rigAt(1_000_000);
    recapWritten(rig.stream, [{ pane: paneId('w1:p1') }, { pane: paneId('w1:p2') }], textOf('turn-ended'));
    recapWritten(rig.stream, [{ pane: paneId('w1:p1') }], textOf('imported'));
    await flush();
    assert.deepEqual(rig.panes.map((sent) => [sent.target, (sent.value ?? '').split(':').slice(1).join(':')]), [['w1:p1', 'recap-written:turn-ended'], ['w1:p2', 'recap-written:turn-ended']]);
});
