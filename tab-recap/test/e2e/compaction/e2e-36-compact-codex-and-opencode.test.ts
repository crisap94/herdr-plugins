import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { opencodeFixture, type Fixture } from '#test/opencode-fixture.ts';
import { Method } from '@stateforge-labs/herdr-sdk';
import { BRIEF, compactionWorld, type CompactionWorld } from '../support/compaction-world.ts';

const RESTORE = `We just compacted this conversation. This is where things stand: ${BRIEF} Nothing needs doing yet: just answer "ok".`;
const CODEX = 'w1:p1';
const OPENCODE = 'w1:p2';
const GEMINI = 'w1:p3';
const ROLLOUT = 'rollout-2026-11-26T10-00-00-0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a.jsonl';

function codexRollout(home: string): string {
    const day = new Date();
    const folder = join(home, '.codex', 'sessions', String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    mkdirSync(folder, { recursive: true });
    const path = join(folder, ROLLOUT);
    writeFileSync(path, [
        { type: 'session_meta', payload: { cwd: '/work', id: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a' } },
        { timestamp: new Date().toISOString(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Add a cart to the shop' }] } },
    ].map((row) => `${JSON.stringify(row)}\n`).join(''));
    return path;
}

function opencodeStore(home: string): Fixture {
    const folder = join(home, 'data', 'opencode');
    mkdirSync(folder, { recursive: true });
    const store = opencodeFixture(folder);
    store.add({ id: 'msg_1', session: 'ses_new', role: 'user', updated: Date.now() - 60_000, parts: [{ type: 'text', text: 'Fix the build' }] });
    return store;
}

describe('compact on a codex lane and an opencode lane of one tab, with a gemini lane beside them', () => {
    let made: CompactionWorld;
    let rollout: string;
    let store: Fixture;

    before(async () => {
        made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom', TAB_RECAP_COMPACT_TARGET: 'all', HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p9' }) });
        made.world.model.answer('default', BRIEF);
        made.world.typing();
        rollout = codexRollout(made.world.world.home);
        store = opencodeStore(made.world.world.home);
        made.lanes([{ pane: CODEX, agent: 'codex', status: 'idle', cwd: '/work' }, { pane: OPENCODE, agent: 'opencode', status: 'idle', cwd: '/repo' }, { pane: GEMINI, agent: 'gemini', status: 'idle', cwd: '/elsewhere' }]);
        await made.world.start();
    });

    after(async () => {
        store.close();
        await made.close();
    });

    test('compact says the compaction was requested', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.code, 0, ran.stderr);
        assert.equal(ran.stdout, 'tab-recap: compaction requested\n');
    });

    test('codex has its own /compact typed as a command, with Enter', { timeout: 30_000 }, async () => {
        assert.deepEqual(await made.awaitTyped(2, CODEX), ['text /compact', 'keys enter']);
    });

    test('opencode has its own /compact typed the same way', { timeout: 30_000 }, async () => {
        assert.deepEqual(await made.awaitTyped(2, OPENCODE), ['text /compact', 'keys enter']);
    });

    test('the gemini lane is never offered a compaction', { timeout: 30_000 }, () => {
        assert.deepEqual(made.typed(GEMINI), []);
        assert.equal(made.compactions().filter((row) => row['pane'] === GEMINI).length, 0);
    });

    test('no restore message is sent before the compaction is confirmed', { timeout: 30_000 }, () => {
        assert.deepEqual([made.typed(CODEX).length, made.typed(OPENCODE).length], [2, 2]);
        assert.deepEqual(made.compactions().map((row) => [row['pane'], row['stage']]), [[CODEX, 'compacting'], [OPENCODE, 'compacting']]);
    });

    test('the agents compact: each is then told where things stand, with the brief inside, after its /compact', { timeout: 30_000 }, async () => {
        const at = Date.now();
        appendFileSync(rollout, `${JSON.stringify({ timestamp: new Date(at).toISOString(), type: 'compacted', payload: { message: '', replacement_history: [] } })}\n`);
        store.add({ id: 'msg_2', session: 'ses_new', role: 'assistant', updated: at, data: { 'summary': true, mode: 'compaction', time: { created: at, completed: at + 2000 } }, parts: [{ type: 'text', text: 'Summary of the build fix' }] });
        assert.deepEqual(await made.awaitTyped(3, CODEX), ['text /compact', 'keys enter', `prompt ${RESTORE}`]);
        assert.deepEqual(await made.awaitTyped(3, OPENCODE), ['text /compact', 'keys enter', `prompt ${RESTORE}`]);
    });

    test('while the restore message is answered the record says restoring', { timeout: 30_000 }, async () => {
        assert.equal((await made.awaitStage('restoring', CODEX))['pane'], CODEX);
        assert.equal((await made.awaitStage('restoring', OPENCODE))['pane'], OPENCODE);
    });

    test('once the agents answer, both records are compacted, with the brief and its writer', { timeout: 30_000 }, async () => {
        made.settle(CODEX);
        made.settle(OPENCODE);
        const codex = await made.awaitStage('compacted', CODEX);
        const opencode = await made.awaitStage('compacted', OPENCODE);
        assert.deepEqual([codex['agent'], codex['brief'], codex['retried']], ['codex', 'written', 0]);
        assert.deepEqual([opencode['agent'], opencode['brief'], opencode['retried']], ['opencode', 'written', 0]);
        assert.match(String(codex['writer']), /^custom/u);
    });

    test('the operator is told, for each agent, that it compacted', { timeout: 30_000 }, async () => {
        await made.world.until(() => (made.toasts().filter((each) => each.includes(' compacted')).length === 2 ? true : undefined), 'both end toasts');
        const [codex, opencode] = made.toasts().filter((each) => each.includes(' compacted')).toSorted();
        assert.match(codex ?? '', /^Compact codex \| codex compacted in \d+ s$/);
        assert.equal(opencode, 'Compact opencode | opencode compacted in 2 s');
    });

    test('nothing more is typed into any lane', { timeout: 30_000 }, () => {
        assert.deepEqual([made.typed(CODEX).length, made.typed(OPENCODE).length, made.typed(GEMINI).length], [3, 3, 0]);
    });
});

async function codexAlone(env: Readonly<Record<string, string>>, setup: (made: CompactionWorld) => void = () => undefined): Promise<{ readonly made: CompactionWorld; readonly rollout: string }> {
    const made = await compactionWorld({ HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p9' }), ...env });
    made.world.model.answer('default', BRIEF);
    made.world.typing();
    const rollout = codexRollout(made.world.world.home);
    made.lanes([{ pane: CODEX, agent: 'codex', status: 'idle', cwd: '/work' }]);
    setup(made);
    await made.world.start();
    return { made, rollout };
}

describe('compact on a codex lane with no brief job', () => {
    let made: CompactionWorld;
    let rollout: string;

    before(async () => {
        ({ made, rollout } = await codexAlone({ TAB_RECAP_COMPACT_BY: 'off' }));
    });

    after(async () => {
        await made.close();
    });

    test('after its /compact the agent is told the goal of the recap, with nothing for it to do', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact', '--note', 'keep the schema');
        assert.equal(ran.code, 0, ran.stderr);
        await made.awaitTyped(2, CODEX);
        appendFileSync(rollout, `${JSON.stringify({ timestamp: new Date().toISOString(), type: 'compacted', payload: { message: '', replacement_history: [] } })}\n`);
        const typed = await made.awaitTyped(3, CODEX);
        assert.ok(typed[2]?.startsWith('prompt We just compacted this conversation. This is where things stand:\n'), typed[2]);
        assert.ok(typed[2]?.includes('- Above all, keep: keep the schema\n'), typed[2]);
        assert.ok(typed[2]?.endsWith('Keep these in mind from here on. Nothing needs doing yet: do not start anything or run any command, just answer "ok".'), typed[2]);
    });

    test('the record says template, with no reason', { timeout: 30_000 }, async () => {
        made.settle(CODEX);
        const row = await made.awaitStage('compacted', CODEX);
        assert.deepEqual([row['brief'], row['writer'], row['template_why']], ['template', null, null]);
    });
});

describe('compact on a codex lane when herdr refuses the typing', () => {
    let made: CompactionWorld;

    before(async () => {
        ({ made } = await codexAlone({ TAB_RECAP_COMPACT_BY: 'custom' }, (each) => {
            each.world.world.herdr.fail(Method.PaneSendText, { code: 'pane_gone', message: 'the pane went away' });
        }));
    });

    after(async () => {
        await made.close();
    });

    test('the record says failed, with the reason, and the operator is told', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.code, 0, ran.stderr);
        const row = await made.awaitStage('failed', CODEX);
        assert.match(String(row['why']), /the pane went away/u);
        await made.world.until(() => (made.toasts().some((each) => each.startsWith('Compact codex | Could not compact codex:')) ? true : undefined), 'the failure toast');
    });

    test('no Enter and no restore message is sent to an agent that never took the command', { timeout: 30_000 }, () => {
        assert.deepEqual(made.typed(CODEX), ['text /compact']);
        assert.equal(made.world.world.herdr.requests().filter((each) => each.method === 'agent.prompt').length, 0);
    });

    test('the lane is free: the next ask is attempted, not held back', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.code, 0, ran.stderr);
        await made.world.until(() => (made.compactions().length === 2 ? true : undefined), 'a second attempt');
    });
});

describe('compact in a tab set to compact codex agents only', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom', TAB_RECAP_COMPACT_TARGET: 'codex', HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1', pane_id: 'w1:p9' }) });
        made.world.model.answer('default', BRIEF);
        made.world.typing();
        codexRollout(made.world.world.home);
        made.lanes([{ pane: 'w1:p1', agent: 'claude', status: 'idle' }, { pane: 'w1:p4', agent: 'codex', status: 'idle', cwd: '/work' }]);
        await made.world.start();
    });

    after(async () => {
        await made.close();
    });

    test('only the codex agent is compacted', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.code, 0, ran.stderr);
        assert.deepEqual(await made.awaitTyped(2, 'w1:p4'), ['text /compact', 'keys enter']);
        assert.deepEqual(made.typed('w1:p1'), []);
    });
});
