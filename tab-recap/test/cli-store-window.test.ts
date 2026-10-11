import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCliStore } from '#src/daemon/cli-store.ts';
import { instant } from '#src/recap/domain/time.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';

const DAY_MS = 86_400_000;
const KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_STATE', 'TAB_RECAP_CLOSED_LANE_DAYS'] as const;

function withEnv(days: string | undefined, body: (state: string) => void): void {
    const saved = KEYS.map((key) => process.env[key]);
    const root = mkdtempSync(join(tmpdir(), 'recap-cli-window-'));
    const state = join(root, 'state');
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = join(root, 'config');
    process.env['TAB_RECAP_STATE'] = state;
    if (days === undefined) {
        delete process.env['TAB_RECAP_CLOSED_LANE_DAYS'];
    } else {
        process.env['TAB_RECAP_CLOSED_LANE_DAYS'] = days;
    }
    try {
        body(state);
    } finally {
        KEYS.forEach((key, index) => {
            const value = saved[index];
            if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; }
        });
        rmSync(root, { recursive: true, force: true });
    }
}

function protectedAfter(days: string | undefined, closedDaysAgo: number): readonly string[] {
    let found: readonly string[] = [];
    withEnv(days, () => {
        const store = openCliStore();
        if (store.kind !== 'ready') {
            assert.fail('a fresh state directory opens ready');
        }
        const now = Date.now();
        store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
        store.closedLanes.record({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), since: null, cwd: null, closedAt: instant(now - closedDaysAgo * DAY_MS) });
        found = store.closedLanes.protectedTabs(instant(now)).map(String);
        store.close();
    });
    return found;
}

test('the CLI store keeps closure records for the window in TAB_RECAP_CLOSED_LANE_DAYS: a 10-day-old closure is outside 7 days', () => {
    assert.deepEqual(protectedAfter('7', 10), []);
});

test('the CLI store keeps closure records for the window in TAB_RECAP_CLOSED_LANE_DAYS: a 10-day-old closure is inside 14 days', () => {
    assert.deepEqual(protectedAfter('14', 10), ['w1:t1']);
});

test('the CLI store uses the default window of 14 days when the setting is unset', () => {
    assert.deepEqual(protectedAfter(undefined, 10), ['w1:t1']);
});
