import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Method } from '@stateforge-labs/herdr-sdk';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { add } from '../support/engine-world.ts';
import { handoffWorld, SOURCE, TARGET, type HandoffWorld } from '../support/handoff-world.ts';
import { TAB } from '../support/recap-daemon-world.ts';

const ANSWER = 'tab-recap-handoff';
const EVENT = 'tab-recap-event';
const LEDGER = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop'), add('now', 'Writing the cart tests', 'Writing the cart tests')] });

interface Written {
    readonly pane: string;
    readonly tokens: Readonly<Record<string, string | null>>;
}

describe('another pane asks for a handoff over herdr tokens', () => {
    let world: HandoffWorld;
    let sent: string;

    const settings = (events: 'on' | 'off', requests?: string): void => {
        writeFileSync(join(world.recap.world.configDir, 'config.env'), `TAB_RECAP_HERDR_EVENTS=${events}\n${requests === undefined ? '' : `TAB_RECAP_HANDOFF_REQUESTS=${requests}\n`}`);
    };
    const written = (): readonly Written[] => world.recap.world.herdr.requests().flatMap((request) => {
        const params = request.params as { readonly pane_id?: string; readonly tokens?: Record<string, string | null> };
        return request.method === 'pane.report_metadata' ? [{ pane: params.pane_id ?? '', tokens: params.tokens ?? {} }] : [];
    });
    const answers = (): readonly string[] => written().flatMap((each) => (typeof each.tokens[ANSWER] === 'string' ? [`${each.pane} ${each.tokens[ANSWER]}`] : []));
    const events = (pane: string): readonly string[] => written().flatMap((each) => { const value = each.tokens[EVENT]; return each.pane === pane && typeof value === 'string' ? [value.split(':').slice(1).join(':')] : []; });
    const answered = (stage: string): Promise<true> => world.recap.until(() => (answers().includes(`${SOURCE} ${stage}`) ? true : undefined), `the answer ${stage}; the answers read ${JSON.stringify(answers())}`);
    const ask = (id: string, flags = ''): void => {
        world.recap.world.herdr.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { pane_id: SOURCE, tab_id: TAB, workspace_id: 'w1', tokens: { 'handoff-req-coordinator': `${id}:w1:p3${flags}` } } } });
    };
    const queuedRow = (fill: number, id: string, age: number, asked: boolean): void => {
        const key = new Uint8Array(16).fill(fill);
        const hex = Buffer.from(key).toString('hex');
        const at = Date.now() - age;
        world.write(`${asked ? `INSERT INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES ('handoff', 'coordinator', '${id}', '${SOURCE}', ${at}, '${handoffIdOf(key)}', NULL);` : ''}
INSERT INTO request (id, at, kind, target, pane, to_pane, origin, refresh_first, answer) VALUES (X'${hex}', ${at}, 'handoff', '${TAB}', '${SOURCE}', '${TARGET}', 'operator', 0, '${id}');`);
    };
    const stored = (statement: string): readonly Record<string, unknown>[] => world.recap.rows(statement);

    before(async () => {
        world = await handoffWorld({ answers: [LEDGER] });
        world.recap.world.herdr.reply(Method.PaneReportMetadata, { type: 'ok' } as never);
        settings('on');
        await world.recap.until(() => (written().some((each) => each.pane === SOURCE && 'tab-recap-api' in each.tokens) ? true : undefined), 'the lane tokens, so sharing is on');
    });

    after(async () => {
        await world.close();
    });

    test('with handoff requests unset, the ask is answered refused-not-offered, and nothing is queued or sent', { timeout: 30_000 }, async () => {
        ask('h1');
        await answered('h1:refused-not-offered');
        assert.deepEqual(stored("SELECT id FROM request WHERE kind = 'handoff'"), []);
        assert.deepEqual(stored('SELECT id FROM handoff_answer_readable'), []);
        assert.deepEqual(world.prompts(), []);
    });

    test('a setting that is not exactly on is not on: yes and On are refused too', { timeout: 30_000 }, async () => {
        settings('on', 'yes');
        ask('h2');
        await answered('h2:refused-not-offered');
        settings('on', 'On');
        ask('h3');
        await answered('h3:refused-not-offered');
        assert.deepEqual(world.prompts(), []);
    });

    test('with the setting on, the ask is answered queued, then running, then delivered, in that order on the source pane', { timeout: 30_000 }, async () => {
        settings('on', 'on');
        ask('h4');
        sent = await world.prompted();
        await answered('h4:delivered');
        assert.deepEqual(answers().filter((each) => each.includes(' h4:')), [`${SOURCE} h4:queued`, `${SOURCE} h4:running`, `${SOURCE} h4:delivered`]);
    });

    test('both panes are told each stage by an event with the request id', () => {
        const stages = ['handoff-queued:h4', 'handoff-running:h4', 'handoff-delivered:h4'];
        assert.deepEqual(events(SOURCE).filter((each) => each.endsWith(':h4')), stages);
        assert.deepEqual(events(TARGET).filter((each) => each.endsWith(':h4')), stages);
    });

    test('the target lane got one prompt, and the answer is stored as delivered with its ask settled', () => {
        assert.deepEqual(world.prompts(), [sent]);
        assert.ok(sent.startsWith('I am handing you work another agent was doing.'));
        assert.deepEqual(stored('SELECT outcome, reason FROM handoff_answer_readable'), [{ outcome: 'delivered', reason: null }]);
        assert.deepEqual(stored("SELECT id FROM request WHERE kind = 'handoff'"), []);
        assert.equal(stored("SELECT id FROM ask WHERE exchange = 'handoff' AND id = 'h4' AND outcome IS NOT NULL").length, 1);
        assert.equal(stored("SELECT id FROM ask WHERE exchange = 'handoff' AND outcome IS NULL").length, 0);
    });

    test('a handoff the flow refuses is answered with the refusal, and both panes get a failed event naming it', { timeout: 30_000 }, async () => {
        world.recap.world.herdr.push({ event: 'pane.agent_status_changed', data: { pane_id: TARGET, agent_status: 'working' } });
        ask('h5');
        await answered('h5:refused-status-not-ready');
        for (const pane of [SOURCE, TARGET]) {
            await world.recap.until(() => (events(pane).includes('handoff-failed:h5:refused-status-not-ready') ? true : undefined), `the failed event on ${pane}`);
        }
        assert.deepEqual(events(SOURCE).filter((each) => each.includes(':h5')), ['handoff-queued:h5', 'handoff-running:h5', 'handoff-failed:h5:refused-status-not-ready']);
        assert.deepEqual(events(TARGET).filter((each) => each.includes(':h5')), ['handoff-queued:h5', 'handoff-running:h5', 'handoff-failed:h5:refused-status-not-ready']);
        assert.deepEqual(world.prompts(), [sent]);
        assert.deepEqual(stored('SELECT outcome, reason FROM handoff_answer_readable ORDER BY at'), [{ outcome: 'delivered', reason: null }, { outcome: 'refused', reason: 'status-not-ready' }]);
    });

    test('a row taken too late is answered failed-expired on the source pane, and nothing runs', { timeout: 30_000 }, async () => {
        queuedRow(9, 'h10', 3_600_000, true);
        await answered('h10:failed-expired');
        for (const pane of [SOURCE, TARGET]) {
            await world.recap.until(() => (events(pane).includes('handoff-failed:h10:failed-expired') ? true : undefined), `the failed event on ${pane}`);
            assert.deepEqual(events(pane).filter((each) => each.includes(':h10')), ['handoff-failed:h10:failed-expired']);
        }
        assert.deepEqual(answers().filter((each) => each.includes(' h10:')), [`${SOURCE} h10:failed-expired`]);
        assert.deepEqual(stored('SELECT outcome, reason FROM handoff_answer_readable ORDER BY at').at(-1), { outcome: 'failed', reason: 'expired' });
        assert.deepEqual(stored("SELECT id FROM request WHERE kind = 'handoff'"), []);
        assert.equal(stored("SELECT id FROM ask WHERE id = 'h10' AND outcome IS NOT NULL").length, 1);
        assert.deepEqual(world.prompts(), [sent]);
    });

    test('a row whose ask was never recorded is taken and not run: the log says so, and nothing is sent', { timeout: 30_000 }, async () => {
        queuedRow(10, 'h11', 1_000, false);
        await world.recap.world.awaitLog(/handoff hnd_[0-9a-z]{26}: no ask recorded for it; not run/u);
        assert.deepEqual(stored("SELECT id FROM request WHERE kind = 'handoff'"), []);
        assert.equal(answers().filter((each) => each.includes(' h11:')).length, 0);
        assert.deepEqual(world.prompts(), [sent]);
    });

    test('while sharing on herdr is off, the ask is neither answered nor queued, even with the setting on', { timeout: 30_000 }, async () => {
        const had = written().length;
        settings('off', 'on');
        await world.recap.until(() => (written().slice(had).some((each) => each.pane === SOURCE && Object.values(each.tokens).every((value) => value === null)) ? true : undefined), 'the lane tokens cleared');
        ask('h6');
        await world.recap.until(() => (stored("SELECT id FROM ask WHERE id = 'h6'").length === 1 ? true : undefined), 'the ask h6 was seen while sharing was off');
        const mark = written().length;
        world.recap.world.herdr.push({ event: 'pane.agent_status_changed', data: { pane_id: TARGET, agent_status: 'idle' } });
        settings('on', 'on');
        ask('h7');
        const second = await world.prompted(2);
        await answered('h7:delivered');
        assert.ok(second.startsWith('I am handing you work another agent was doing.'));
        assert.equal(answers().filter((each) => each.includes(' h6:')).length, 0);
        assert.equal(written().slice(mark).filter((each) => JSON.stringify(each.tokens).includes('h6')).length, 0);
        assert.deepEqual(stored("SELECT outcome FROM ask WHERE id = 'h6'"), [{ outcome: 'off' }]);
        assert.equal(world.prompts().length, 2);
    });

    test('a source pane that names no session still hands off, its newer prompts unknown', { timeout: 30_000 }, async () => {
        world.recap.world.herdr.reply(Method.PaneGet, { type: 'pane_info', pane: { pane_id: SOURCE, tab_id: TAB, workspace_id: 'w1', agent: 'claude', agent_status: 'idle', agent_session: null, tokens: {} } } as never);
        world.ready();
        ask('h8');
        const text = await world.prompted(3);
        await answered('h8:delivered');
        assert.match(text, /^newer prompts: unknown$/mu);
    });

    test('herdr stops answering pane.get after the prompt: the lane\'s own session confirms, and the ask is delivered', { timeout: 30_000 }, async () => {
        world.ready();
        ask('h9');
        await world.prompted(4);
        world.recap.world.herdr.fail(Method.PaneGet, { code: 'internal', message: 'unavailable' });
        await answered('h9:delivered');
        assert.equal(world.prompts().length, 4);
    });
});
