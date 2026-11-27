import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRIEF, compactionWorld, PANE, SESSION, TAB, type CompactionWorld } from '../support/compaction-world.ts';

const ANSWER = 'tab-recap-compact';
const STRANGER = 'w9:p9';
const FAILED_BAD_ID = 'failed-bad-id';

const askFrom = (made: CompactionWorld, pane: string, tokens: Readonly<Record<string, string>>): void => {
    made.world.world.herdr.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { pane_id: pane, tab_id: TAB, workspace_id: 'w1', agent: 'claude', agent_status: 'idle', terminal_id: 'term1', revision: 1, focused: false, tokens } } });
};

const answers = (made: CompactionWorld, pane: string = PANE): readonly string[] => made.world.world.herdr.requests().flatMap((request) => {
    const params = request.params as { readonly pane_id?: string; readonly tokens?: Readonly<Record<string, string | null>> };
    const value = params.tokens?.[ANSWER];
    return request.method === 'pane.report_metadata' && params.pane_id === pane && typeof value === 'string' ? [value] : [];
});

const answered = (made: CompactionWorld, count: number, pane: string = PANE): Promise<readonly string[]> => made.world.until(() => (answers(made, pane).length >= count ? answers(made, pane) : undefined), `${count} answers to ${pane}; they read ${JSON.stringify(answers(made, pane))}`);

const answeredWith = (made: CompactionWorld, value: string, pane: string = PANE): Promise<readonly string[]> => made.world.until(() => (answers(made, pane).includes(value) ? answers(made, pane) : undefined), `the answer ${value} to ${pane}; they read ${JSON.stringify(answers(made, pane))}`);

const setting = (made: CompactionWorld, value: 'on' | 'off'): void => { writeFileSync(join(made.world.world.configDir, 'config.env'), `TAB_RECAP_HERDR_EVENTS=${value}\n`); };

const advertised = (made: CompactionWorld): number => made.world.world.herdr.requests().filter((request) => request.method === 'pane.report_metadata' && JSON.stringify(request.params).includes('"tab-recap-api":"1"')).length;

const advertises = (made: CompactionWorld, count: number): Promise<true> => made.world.until(() => (advertised(made) >= count ? true : undefined), 'the lane advertises the protocol');

const cleared = (made: CompactionWorld): Promise<true> => made.world.until(() => (made.world.world.herdr.requests().some((request) => {
    const tokens = (request.params as { readonly tokens?: Readonly<Record<string, string | null>> }).tokens;
    return request.method === 'pane.report_metadata' && tokens !== undefined && 'tab-recap-api' in tokens && Object.values(tokens).every((value) => value === null);
}) ? true : undefined), 'the lane tokens are cleared');

const subscriptions = (made: CompactionWorld): number => made.world.world.herdr.requests().filter((request) => request.method === 'events.subscribe').length;

const briefs = (made: CompactionWorld): readonly string[] => made.world.model.calls().filter((call) => call.startsWith('<compaction_input'));

const compactions = (made: CompactionWorld): number => made.world.rows('SELECT origin FROM compaction').length;

async function ready(events: 'env' | 'file' | 'unset' = 'env'): Promise<CompactionWorld> {
    const made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom', ...(events === 'env' ? { TAB_RECAP_HERDR_EVENTS: 'on' } : {}) });
    if (events === 'file') {
        setting(made, 'on');
    }
    made.world.model.answer('default', BRIEF);
    made.world.typing();
    made.world.announce([PANE]);
    made.world.grow(1);
    made.world.world.herdr.reply('pane.report_metadata' as never, { type: 'ok' } as never);
    await made.world.start();
    return made;
}

async function lane(agent: string, setup: (made: CompactionWorld) => void): Promise<CompactionWorld> {
    const made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom', TAB_RECAP_HERDR_EVENTS: 'on' });
    made.world.model.answer('default', BRIEF);
    made.world.typing();
    made.world.world.herdr.reply('pane.report_metadata' as never, { type: 'ok' } as never);
    made.lanes([{ pane: PANE, agent, status: 'idle', ...(agent === 'claude' ? { session: SESSION } : {}) }]);
    setup(made);
    await made.world.start();
    return made;
}

describe('another pane asks for a compaction over its herdr tokens', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready();
    });

    after(async () => {
        await made.close();
    });

    test('a request with an id and a note is answered queued, then running', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-coordinator': 'r7:focus on the API' });
        assert.deepEqual((await answered(made, 2)).slice(0, 2), ['r7:queued', 'r7:running']);
    });

    test('the lane is compacted for it: the note reaches the brief, and the record says request and keeps the ask id', { timeout: 30_000 }, async () => {
        assert.deepEqual(await made.awaitTyped(3), ['text /compact ', `text ${BRIEF}`, 'keys enter']);
        assert.ok(briefs(made).at(-1)?.includes('focus on the API'), briefs(made).at(-1));
        assert.deepEqual(made.world.rows('SELECT origin, answer FROM compaction').map((row) => [row['origin'], row['answer']]), [['request', 'r7']]);
    });

    test('when the agent has compacted, the requester is told done and the ask is settled with its compaction', { timeout: 30_000 }, async () => {
        await made.compacts();
        await answeredWith(made, 'r7:done');
        assert.deepEqual(answers(made), ['r7:queued', 'r7:running', 'r7:done']);
        const ask = made.world.rows('SELECT requester, id, pane, ref, outcome FROM ask');
        assert.deepEqual(ask.map((row) => [row['requester'], row['id'], row['pane'], row['outcome'] === null]), [['coordinator', 'r7', PANE, false]]);
        assert.match(String(ask[0]?.['ref']), /^cmp_/u);
    });

    test('the same id is not acted on twice, and the same id from another tool is', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-coordinator': 'r7' });
        askFrom(made, PANE, { 'compact-req-reviewer': 'r7' });
        await made.world.until(() => (answers(made).filter((each) => each === 'r7:queued').length === 2 ? true : undefined), 'the reviewer is answered');
        await made.awaitTyped(6);
        assert.equal(compactions(made), 2);
        assert.deepEqual(made.world.rows('SELECT requester FROM ask ORDER BY requester').map((row) => row['requester']), ['coordinator', 'reviewer']);
        await made.compacts();
        await made.world.until(() => (answers(made).filter((each) => each === 'r7:done').length === 2 ? true : undefined), 'the reviewer is told done');
    });

    test('a pane that is no lane is answered failed-not-a-lane and nothing is compacted for it', { timeout: 30_000 }, async () => {
        askFrom(made, STRANGER, { 'compact-req-coordinator': 'r20' });
        assert.deepEqual(await answered(made, 1, STRANGER), ['r20:failed-not-a-lane']);
        assert.equal(compactions(made), 2);
        assert.deepEqual(made.typed(STRANGER), []);
    });

    test('an empty id and an overlong id are answered failed-bad-id, each once, and the answer is not read as a request', { timeout: 30_000 }, async () => {
        const known = answers(made).length;
        askFrom(made, PANE, { 'compact-req-coordinator': ':no id' });
        askFrom(made, PANE, { 'compact-req-coordinator': ':no id', [ANSWER]: `:${FAILED_BAD_ID}` });
        askFrom(made, PANE, { 'compact-req-coordinator': 'x'.repeat(20) });
        askFrom(made, STRANGER, { 'compact-req-coordinator': 'm1' });
        await answeredWith(made, 'm1:failed-not-a-lane', STRANGER);
        assert.deepEqual(answers(made).slice(known), [`:${FAILED_BAD_ID}`, `${'x'.repeat(16)}:${FAILED_BAD_ID}`]);
        assert.equal(compactions(made), 2);
    });

    test('a tool name that is no token word, other tokens and a request with no tool name are not requests', { timeout: 30_000 }, async () => {
        const known = answers(made).length;
        askFrom(made, PANE, { 'compact-req-a.b': ':x', 'tab-recap-api': '1', 'typing-coordinator': '5', 'compact-req-': 'r7' });
        askFrom(made, STRANGER, { 'compact-req-coordinator': 'm2' });
        await answeredWith(made, 'm2:failed-not-a-lane', STRANGER);
        assert.deepEqual(answers(made).slice(known), []);
        assert.equal(compactions(made), 2);
    });

    test('the note is everything after the first colon: a colon in it stays, and a bare colon is no note', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-coordinator': 'r11:focus: the API' });
        await made.awaitTyped(9);
        assert.ok(briefs(made).at(-1)?.includes('focus: the API'), briefs(made).at(-1));
        await made.compacts();
        await answeredWith(made, 'r11:done');
        askFrom(made, PANE, { 'compact-req-coordinator': 'r12:' });
        await made.awaitTyped(12);
        assert.ok(!(briefs(made).at(-1) ?? '').includes('focus'), briefs(made).at(-1));
        await made.compacts();
        await answeredWith(made, 'r12:done');
    });

    test('a note too long for the answer is cut so that the answer fits: 77 characters behind a two-character id', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-auditor': `r7:${'n'.repeat(200)}` });
        await made.awaitTyped(15);
        assert.equal(/<note>(.*)<\/note>/u.exec(briefs(made).at(-1) ?? '')?.[1]?.length, 77);
        await made.compacts();
        await made.world.until(() => (answers(made).filter((each) => each === 'r7:done').length === 3 ? true : undefined), 'the auditor is told done');
    });

    test('after the daemon restarts, an id it already knows is not acted on again, and a new one is', { timeout: 30_000 }, async () => {
        const dead = made.world.world.pidfile().pid;
        assert.ok(dead !== null);
        const watching = subscriptions(made);
        process.kill(dead, 'SIGKILL');
        await made.world.world.awaitGone(dead);
        await made.world.start();
        await made.world.until(() => (subscriptions(made) > watching ? true : undefined), 'the new daemon watches the lane');
        const known = compactions(made);
        askFrom(made, PANE, { 'compact-req-coordinator': 'r7' });
        askFrom(made, STRANGER, { 'compact-req-coordinator': 'm3' });
        await answeredWith(made, 'm3:failed-not-a-lane', STRANGER);
        assert.equal(compactions(made), known);
        askFrom(made, PANE, { 'compact-req-coordinator': 'r13' });
        await answeredWith(made, 'r13:queued');
    });
});

describe('a request asked while the setting is off', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready('unset');
    });

    after(async () => {
        await made.close();
    });

    test('nothing is read, queued or answered', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-coordinator': 'r7' });
        askFrom(made, STRANGER, { 'compact-req-coordinator': 's7' });
        await made.world.until(() => (made.world.rows('SELECT id FROM ask').length === 2 ? true : undefined), 'both asks seen');
        setting(made, 'on');
        await advertises(made, 1);
        assert.deepEqual([answers(made), answers(made, STRANGER), compactions(made)], [[], [], 0]);
    });

    test('it is remembered, not acted on later: asked again once the setting is on it runs nothing', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-coordinator': 'r7' });
        askFrom(made, STRANGER, { 'compact-req-coordinator': 'm1' });
        await answeredWith(made, 'm1:failed-not-a-lane', STRANGER);
        assert.deepEqual([answers(made), compactions(made)], [[], 0]);
    });

    test('a new id is acted on, so the silence was the memory and not deafness', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-coordinator': 'r8' });
        assert.equal((await answered(made, 1))[0], 'r8:queued');
    });
});

describe('a compaction asked by another pane when the setting goes off before it ends', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready('file');
    });

    after(async () => {
        await made.close();
    });

    test('the compaction ends, and the requester is not told', { timeout: 30_000 }, async () => {
        askFrom(made, PANE, { 'compact-req-coordinator': 'r5' });
        await made.awaitTyped(3);
        const known = advertised(made);
        setting(made, 'off');
        await cleared(made);
        await made.compacts();
        await made.awaitStage('compacted');
        await made.world.until(() => (made.world.rows("SELECT outcome FROM ask WHERE id = 'r5'").some((row) => row['outcome'] !== null) ? true : undefined), 'the ask r5 is settled');
        setting(made, 'on');
        await advertises(made, known + 1);
        assert.deepEqual(answers(made), ['r5:queued', 'r5:running']);
    });
});

const refusal = (name: string, agent: string, setup: (each: CompactionWorld) => void, expected: readonly string[]): void => {
    describe(`a request on a lane whose agent refuses: ${name}`, () => {
        let each: CompactionWorld;

        before(async () => {
            each = await lane(agent, setup);
        });

        after(async () => {
            await each.close();
        });

        test('the requester is told why, nothing is typed, and the ask is settled with the compaction that answered it', { timeout: 30_000 }, async () => {
            askFrom(each, PANE, { 'compact-req-coordinator': 'r7' });
            await answeredWith(each, expected.at(-1) ?? '');
            assert.deepEqual(answers(each), expected);
            assert.deepEqual(each.typed(), []);
            const ask = await each.world.until(() => {
                const rows = each.world.rows('SELECT ref, outcome FROM ask');
                return rows[0] !== undefined && rows[0]['outcome'] !== null ? rows : undefined;
            }, 'the ask settled');
            assert.match(String(ask[0]?.['ref']), /^cmp_/u);
            assert.equal(compactions(each), 1);
        });
    });
};

refusal('a codex agent that is working', 'codex', (each) => { each.agentIs('working'); }, ['r7:queued', 'r7:failed-busy']);
refusal('a claude agent that is blocked', 'claude', (each) => { each.agentIs('blocked'); }, ['r7:queued', 'r7:failed-skipped']);
refusal('an agent whose state herdr cannot read', 'codex', (each) => { each.world.world.herdr.fail('agent.get', { code: 'internal_error', message: 'agent cannot compact right now' }); }, ['r7:queued', 'r7:failed-error']);
refusal('a codex agent that turns busy while the brief is written', 'codex', (each) => { each.agentGoes(['idle', 'working']); }, ['r7:queued', 'r7:running', 'r7:failed-busy']);
