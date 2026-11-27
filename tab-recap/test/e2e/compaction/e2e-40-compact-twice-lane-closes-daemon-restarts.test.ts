import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF, compactionWorld, type CompactionWorld } from '../support/compaction-world.ts';

const ASKED = 'tab-recap: compaction requested\n';

async function ready(setup: (made: CompactionWorld) => void = () => undefined): Promise<CompactionWorld> {
    const made = await compactionWorld({ TAB_RECAP_COMPACT_BY: 'custom' });
    made.world.model.answer('default', BRIEF);
    made.world.typing();
    made.world.announce(['w1:p1']);
    setup(made);
    made.world.grow(1);
    await made.world.start();
    return made;
}

const toastedWith = (made: CompactionWorld, line: string): Promise<true> => made.world.until(() => (made.toasts().includes(line) ? true : undefined), `the toast ${line}; the toasts read ${JSON.stringify(made.toasts())}`);

describe('compact asked twice for one lane at the same moment', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready();
    });

    after(async () => {
        await made.close();
    });

    test('both asks are taken', { timeout: 30_000 }, async () => {
        const asked = await Promise.all([made.world.world.command('compact'), made.world.world.command('compact')]);
        assert.deepEqual(asked.map((each) => [each.code, each.stdout]), [[0, ASKED], [0, ASKED]]);
        await made.world.until(() => (made.world.rows('SELECT kind FROM request').length === 0 ? true : undefined), 'both requests taken');
    });

    test('the second joins the compaction under way: the operator is told', { timeout: 30_000 }, async () => {
        await toastedWith(made, 'Compact claude | claude is already compacting: this request joins that compaction');
    });

    test('the lane is compacted once: one line typed, one record, one brief', { timeout: 30_000 }, async () => {
        assert.deepEqual(await made.awaitTyped(3), ['text /compact ', `text ${BRIEF}`, 'keys enter']);
        assert.equal(made.compactions().length, 1);
        assert.equal(made.world.model.calls().filter((call) => call.startsWith('<compaction_input')).length, 1, 'one brief');
        assert.equal(made.typed().filter((each) => each === 'keys enter').length, 1);
    });

    test('a joined ask with a note is told its note is not used', { timeout: 30_000 }, async () => {
        const first = await made.world.world.command('compact');
        assert.equal(first.stdout, ASKED);
        const joined = await made.world.world.command('compact', '--note', 'keep the schema');
        assert.equal(joined.stdout, ASKED);
        await toastedWith(made, 'Compact claude | claude is already compacting: this request joins that compaction, and its note is not used');
        assert.equal(made.typed().filter((each) => each === 'keys enter').length, 1);
    });

    test('once it is done, a new ask compacts the lane again', { timeout: 30_000 }, async () => {
        await made.compacts();
        await made.awaitStage('compacted');
        made.world.status('working');
        made.world.status('idle');
        const ran = await made.world.world.command('compact');
        assert.equal(ran.stdout, ASKED);
        assert.equal((await made.awaitTyped(6)).filter((each) => each === 'keys enter').length, 2);
        await made.world.until(() => (made.compactions().length === 2 ? true : undefined), 'a second record');
    });
});

describe('compact on a lane that closes before the line is typed', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready((each) => { each.agentGoes(['idle', 'gone']); });
    });

    after(async () => {
        await made.close();
    });

    test('the closed lane is reported in the log, at the point where it was missed', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.stdout, ASKED);
        await made.world.world.awaitLog(/compaction: claude w1:p1 closed, skipped \(before typing\)/u);
    });

    test('nothing is typed and the record is skipped, saying the lane closed', { timeout: 30_000 }, async () => {
        const row = await made.awaitStage('skipped');
        assert.deepEqual([row['why'], row['brief']], ['lane closed', 'written']);
        assert.deepEqual(made.typed(), []);
    });

    test('the operator is not sent a toast about a failure', { timeout: 30_000 }, () => {
        assert.deepEqual(made.toasts().filter((each) => each.includes('Could not compact') || each.includes('not compacted')), []);
    });
});

describe('compact on a lane that is already closed when the status is read', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready((each) => { each.agentGoes(['gone']); });
    });

    after(async () => {
        await made.close();
    });

    test('the closed lane is reported at the status check, and nothing is written or typed', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.stdout, ASKED);
        await made.world.world.awaitLog(/compaction: claude w1:p1 closed, skipped \(at the status check\)/u);
        const row = await made.awaitStage('skipped');
        assert.equal(row['why'], 'lane closed');
        assert.deepEqual(made.typed(), []);
        assert.equal(made.world.model.calls().filter((call) => call.includes('<agent')).length, 0);
    });
});

describe('compact under way when the daemon restarts', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await ready();
    });

    after(async () => {
        await made.close();
    });

    test('the line is typed and the compaction waits for the agent: the record says compacting', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.stdout, ASKED);
        await made.awaitTyped(3);
        const row = await made.awaitStage('compacting');
        assert.equal(row['finished_at'], null);
    });

    test('the daemon dies and starts again: the ask is not confirmed, and the reason is the restart', { timeout: 30_000 }, async () => {
        const dead = made.world.world.pidfile().pid;
        assert.ok(dead !== null);
        process.kill(dead, 'SIGKILL');
        await made.world.world.awaitGone(dead);
        await made.world.start();
        const row = await made.awaitStage('unconfirmed');
        assert.equal(row['why'], 'the daemon restarted');
        assert.notEqual(row['finished_at'], null);
    });

    test('the lane is not compacted again by the restart', { timeout: 30_000 }, () => {
        assert.equal(made.typed().filter((each) => each === 'keys enter').length, 1);
        assert.equal(made.compactions().length, 1);
    });
});
