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
const LEDGER = JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop')] });

interface Written {
    readonly pane: string;
    readonly tokens: Readonly<Record<string, string | null>>;
}

async function ready(): Promise<HandoffWorld> {
    const world = await handoffWorld({ answers: [LEDGER] });
    world.recap.world.herdr.reply(Method.PaneReportMetadata, { type: 'ok' } as never);
    return world;
}

const written = (world: HandoffWorld): readonly Written[] => world.recap.world.herdr.requests().flatMap((request) => {
    const params = request.params as { readonly pane_id?: string; readonly tokens?: Record<string, string | null> };
    return request.method === 'pane.report_metadata' ? [{ pane: params.pane_id ?? '', tokens: params.tokens ?? {} }] : [];
});
const answersOf = (world: HandoffWorld): readonly string[] => written(world).flatMap((each) => (typeof each.tokens[ANSWER] === 'string' ? [`${each.pane} ${each.tokens[ANSWER]}`] : []));
const eventsOf = (world: HandoffWorld, pane: string): readonly string[] => written(world).flatMap((each) => { const value = each.tokens[EVENT]; return each.pane === pane && typeof value === 'string' ? [value.split(':').slice(1).join(':')] : []; });
const answeredWith = (world: HandoffWorld, line: string): Promise<true> => world.recap.until(() => (answersOf(world).includes(line) ? true : undefined), `the answer ${line}; the answers read ${JSON.stringify(answersOf(world))}`);
const prompted = (world: HandoffWorld, count: number): Promise<true> => world.recap.until(() => (world.prompts().length >= count ? true : undefined), `${count} prompt(s) to the target lane`);
const settings = (world: HandoffWorld, events: 'on' | 'off', requests?: string): void => {
    writeFileSync(join(world.recap.world.configDir, 'config.env'), `TAB_RECAP_HERDR_EVENTS=${events}\n${requests === undefined ? '' : `TAB_RECAP_HANDOFF_REQUESTS=${requests}\n`}`);
};
const sharingOn = (world: HandoffWorld, requests = 'on'): Promise<true> => {
    const had = written(world).length;
    settings(world, 'on', requests);
    return world.recap.until(() => (written(world).slice(had).some((each) => each.pane === SOURCE && 'tab-recap-api' in each.tokens) ? true : undefined), 'the lane tokens, so sharing is on');
};
const ask = (world: HandoffWorld, id: string): void => {
    world.recap.world.herdr.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { pane_id: SOURCE, tab_id: TAB, workspace_id: 'w1', tokens: { 'handoff-req-coordinator': `${id}:w1:p3` } } } });
};
const queuedRow = (world: HandoffWorld, id: string): void => {
    const key = new Uint8Array(16).fill(11);
    const at = Date.now();
    world.write(`INSERT INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES ('handoff', 'coordinator', '${id}', '${SOURCE}', ${at}, '${handoffIdOf(key)}', NULL);
INSERT INTO request (id, at, kind, target, pane, to_pane, origin, refresh_first, answer) VALUES (X'${Buffer.from(key).toString('hex')}', ${at}, 'handoff', '${TAB}', '${SOURCE}', '${TARGET}', 'operator', 0, '${id}');`);
};

async function restart(world: HandoffWorld, seed: () => void = () => undefined): Promise<void> {
    const dead = world.recap.world.pidfile().pid;
    assert.ok(dead !== null);
    process.kill(dead, 'SIGKILL');
    await world.recap.world.awaitGone(dead);
    seed();
    const subscribed = (): number => world.recap.world.herdr.requests().filter((request) => request.method === 'events.subscribe').length;
    const had = subscribed();
    await world.recap.start();
    await world.recap.until(() => (subscribed() > had ? true : undefined), 'the restarted daemon watches the lanes');
}

describe('the daemon restarts while a handoff asked by the command is being confirmed', () => {
    let world: HandoffWorld;
    let first: string;
    let ran: ReturnType<HandoffWorld['recap']['world']['command']>;

    before(async () => {
        world = await ready();
        await sharingOn(world, 'off');
    });

    after(async () => {
        await world.close();
    });

    test('the target is prompted once, and the handoff waits for the target to start working', { timeout: 30_000 }, async () => {
        ran = world.recap.world.command('handoff', '--from', SOURCE, '--to', TARGET);
        await prompted(world, 1);
        first = world.prompts()[0] ?? '';
        assert.ok(first.startsWith('I am handing you work another agent was doing.'));
        assert.deepEqual(world.recap.rows("SELECT id FROM ask WHERE exchange = 'handoff' AND outcome IS NULL").length, 1);
        assert.deepEqual(world.recap.rows('SELECT id FROM handoff_answer_readable'), []);
    });

    test('the daemon dies and starts again: the command is told the handoff failed, not delivered', { timeout: 30_000 }, async () => {
        await restart(world);
        const done = await ran;
        assert.equal(done.code, 1);
        assert.equal(done.stdout, '');
        assert.match(done.stderr, /^tab-recap: 1 — the daemon restarted during the handoff: nothing is sent again\n$/u);
    });

    test('the answer is stored as failed-interrupted, and the ask is settled', { timeout: 30_000 }, () => {
        assert.deepEqual(world.recap.rows('SELECT outcome, reason FROM handoff_answer_readable'), [{ outcome: 'failed', reason: 'interrupted' }]);
        assert.equal(world.recap.rows("SELECT id FROM ask WHERE exchange = 'handoff' AND outcome IS NULL").length, 0);
    });

    test('no token is written for a local ask, and nothing is sent again: the next handoff is the only second prompt', { timeout: 30_000 }, async () => {
        world.ready();
        const second = world.recap.world.command('handoff', '--from', SOURCE, '--to', TARGET);
        const text = await world.prompted(2);
        assert.equal((await second).code, 0);
        assert.notEqual(text, first);
        assert.equal(world.prompts().length, 2);
        assert.equal(world.prompts()[0], first);
        assert.deepEqual(answersOf(world), []);
        assert.deepEqual(world.recap.rows('SELECT outcome FROM handoff_answer_readable ORDER BY at'), [{ outcome: 'failed' }, { outcome: 'delivered' }]);
    });
});

describe('the daemon restarts while a handoff asked by another pane is under way', () => {
    let world: HandoffWorld;

    before(async () => {
        world = await ready();
        await sharingOn(world);
    });

    after(async () => {
        await world.close();
    });

    test('an ask taken while sharing was off is settled at once, so a restart writes nothing for it', { timeout: 30_000 }, async () => {
        const had = written(world).length;
        settings(world, 'off', 'on');
        await world.recap.until(() => (written(world).slice(had).some((each) => each.pane === SOURCE && Object.values(each.tokens).every((value) => value === null)) ? true : undefined), 'the lane tokens cleared');
        ask(world, 'h0');
        await world.recap.until(() => (world.recap.rows("SELECT outcome FROM ask WHERE id = 'h0'").length === 1 ? true : undefined), 'the ask h0 was seen while sharing was off');
        await sharingOn(world);
        assert.deepEqual(world.recap.rows("SELECT outcome FROM ask WHERE id = 'h0'"), [{ outcome: 'off' }]);
    });

    test('the ask is queued and the target is prompted once, with the handoff not yet confirmed', { timeout: 30_000 }, async () => {
        ask(world, 'h1');
        await answeredWith(world, `${SOURCE} h1:running`);
        await prompted(world, 1);
        assert.deepEqual(answersOf(world).filter((each) => each.includes(' h1:')), [`${SOURCE} h1:queued`, `${SOURCE} h1:running`]);
        assert.equal(world.prompts().length, 1);
    });

    test('the daemon dies and starts again: the source pane is answered failed-interrupted, and only the source pane', { timeout: 30_000 }, async () => {
        await restart(world);
        await answeredWith(world, `${SOURCE} h1:failed-interrupted`);
        assert.deepEqual(answersOf(world).filter((each) => each.includes(' h1:')), [`${SOURCE} h1:queued`, `${SOURCE} h1:running`, `${SOURCE} h1:failed-interrupted`]);
        assert.equal(answersOf(world).filter((each) => each.startsWith(TARGET)).length, 0);
        assert.equal(eventsOf(world, TARGET).filter((each) => each.includes(':h1:failed')).length, 0);
        assert.equal(answersOf(world).filter((each) => each.includes(' h0:')).length, 0);
    });

    test('the ask is settled and nothing is sent again', { timeout: 30_000 }, () => {
        assert.equal(world.recap.rows("SELECT id FROM ask WHERE exchange = 'handoff' AND outcome IS NULL").length, 0);
        assert.deepEqual(world.recap.rows("SELECT id FROM request WHERE kind = 'handoff'"), []);
        assert.equal(world.prompts().length, 1);
    });

    test('a request still queued when the daemon died is withdrawn by the restart, and never run', { timeout: 30_000 }, async () => {
        await restart(world, () => { queuedRow(world, 'h2'); });
        await answeredWith(world, `${SOURCE} h2:failed-interrupted`);
        assert.deepEqual(world.recap.rows("SELECT id FROM request WHERE kind = 'handoff'"), []);
        assert.deepEqual(answersOf(world).filter((each) => each.includes(' h2:')), [`${SOURCE} h2:failed-interrupted`]);
    });

    test('a later ask is served by the restarted daemon, and it is the second prompt, not a repeat', { timeout: 30_000 }, async () => {
        world.ready();
        ask(world, 'h3');
        const text = await world.prompted(2);
        await answeredWith(world, `${SOURCE} h3:delivered`);
        assert.equal(world.prompts().length, 2);
        assert.notEqual(text, world.prompts()[0]);
        assert.equal(answersOf(world).filter((each) => ['h1:delivered', 'h2:running', 'h2:delivered'].some((stage) => each === `${SOURCE} ${stage}`)).length, 0);
        assert.equal(world.recap.rows("SELECT id FROM ask WHERE exchange = 'handoff' AND outcome IS NULL").length, 0);
    });

    test('with sharing off at the restart, the interrupted ask is settled and no answer is written for it', { timeout: 30_000 }, async () => {
        world.ready();
        ask(world, 'h4');
        await answeredWith(world, `${SOURCE} h4:running`);
        await prompted(world, 3);
        settings(world, 'off', 'on');
        await restart(world);
        await world.recap.until(() => (world.recap.rows("SELECT id FROM ask WHERE id = 'h4' AND outcome IS NOT NULL").length === 1 ? true : undefined), 'the ask h4 settled');
        await sharingOn(world);
        assert.equal(answersOf(world).filter((each) => each.includes(' h4:failed')).length, 0);
        assert.equal(world.prompts().length, 3);
    });
});
