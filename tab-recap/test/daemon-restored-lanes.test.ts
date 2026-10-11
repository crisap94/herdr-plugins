import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoredObservation } from '#src/daemon/restored-lanes.ts';
import type { LiveLanesRead, LiveLanes } from '#src/ports/tab-views.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';

const fakeStore = (read: LiveLanesRead): LiveLanes => ({ liveLanes: (): LiveLanesRead => read });

test('the persisted lanes reach the fold as one restored observation, logged nothing', () => {
    const lanes = [{ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: instant(5), cwd: null }];
    const logged: string[] = [];
    assert.deepEqual(restoredObservation(fakeStore({ kind: 'read', lanes }), (line: string) => { logged.push(line); }), { kind: 'restored', lanes });
    assert.deepEqual(logged, []);
});

test('no persisted lane still reaches the fold, so the first snapshot knows the boot had none', () => {
    assert.deepEqual(restoredObservation(fakeStore({ kind: 'read', lanes: [] }), () => undefined), { kind: 'restored', lanes: [] });
});

test('a persisted lane list that cannot be read is logged without its content and pushes nothing', () => {
    const logged: string[] = [];
    const observed = restoredObservation(fakeStore({ kind: 'unknown', why: { why: 'unreadable', detail: 'SELECT the secret' } }), (line: string) => { logged.push(line); });
    assert.equal(observed, null);
    assert.deepEqual(logged, ['restored lanes: the persisted lanes could not be read (unreadable)']);
});
