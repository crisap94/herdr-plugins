import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { present } from '#src/view-model/present.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';

const noGlow = (): null => null;

test('a warning is shown red above the lanes, then a blank line; none shows nothing', () => {
    const tab = viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'x', cwd: null }] });
    const warned = present({ tab, recap: null, notes: new Map(), warnings: ['something is silent'], now: 0, messages: en }, 40, noGlow);
    assert.match(warned[0] ?? '', /something is silent/);
    assert.equal(warned[1], '');
    const calm = present({ tab, recap: null, notes: new Map(), warnings: [], now: 0, messages: en }, 40, noGlow);
    assert.doesNotMatch(calm.join('\n'), /silent/);
});
