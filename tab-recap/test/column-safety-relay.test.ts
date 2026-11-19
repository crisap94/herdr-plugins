import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { paneEnvOf } from '../bin/commands/pane.ts';
import { reconciliationOf } from '#src/adapters/herdr/json.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import { relayEnvOf, shownTitle, titleOf } from '#src/pane/relay-env.ts';

const ROOT = pathToFileURL(`${join(import.meta.dirname, '..')}/`);

const relayTitle = (env: NodeJS.ProcessEnv): string => {
    const relay = relayEnvOf(env, ROOT);
    return shownTitle(relay, titleOf(relay.hello.role)).title;
};

const cliTitle = (args: readonly string[]): string => {
    const env = paneEnvOf(args, {});
    assert.ok(env !== null);
    return relayTitle(env);
};

const pane = (id: string, tab: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
    ({ pane_id: id, tab_id: tab, terminal_title_stripped: title, agent: null, label: null, ...extra });

const closesOf = (panes: Record<string, unknown>[], agents: Record<string, unknown>[]): string[] => {
    const seen = reconciliationOf({ panes, agents, layouts: [] });
    const intents: readonly Intent[] = observe(emptyBoard(), { kind: 'reconciled', seen }, instant(1000), DEFAULT_POLICY).intents;
    return intents.flatMap((intent) => (intent.kind === 'close-column' ? [String(intent.column)] : []));
};

const agent = { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1', agent: 'claude', agent_status: 'idle' };

test('a relay started with `tab-recap pane` beside the old column is kept, in every mode; a real duplicate column is still closed', () => {
    for (const args of [['w1:t1'], ['w1:t1', '--mode', 'modal'], ['w1:t1', '--mode', 'bar']]) {
        const panes = [
            pane('w1:p1', 'w1:t1', 'claude', { agent: 'claude' }),
            pane('w1:p2', 'w1:t1', 'tab-recap', { label: 'Recap' }),
            pane('w1:p3', 'w1:t1', cliTitle(args)),
            pane('w1:p4', 'w1:t1', 'tab-recap'),
        ];
        assert.deepEqual(closesOf(panes, [agent]), ['w1:p4'], `${args.join(' ')}: only the duplicate column is closed`);
    }
});

test('a relay beside the old column in a tab with no agent is never closed', () => {
    const panes = [pane('w1:p1', 'w1:t1', 'zsh'), pane('w1:p2', 'w1:t1', cliTitle(['w1:t1']))];
    assert.deepEqual(closesOf(panes, []), []);
    assert.deepEqual(reconciliationOf({ panes, agents: [], layouts: [] }).columns, []);
});

test('a relay herdr opens as the column (no `pane` word) keeps the column title, so it still counts as the column', () => {
    assert.equal(relayTitle({}), 'tab-recap');
    assert.equal(relayTitle({ TAB_RECAP_SHAPE: 'bar' }), 'tab-recap:bar');
    const panes = [pane('w1:p1', 'w1:t1', 'claude', { agent: 'claude' }), pane('w1:p2', 'w1:t1', relayTitle({})), pane('w1:p3', 'w1:t1', relayTitle({}))];
    assert.deepEqual(closesOf(panes, [agent]), ['w1:p3']);
});
