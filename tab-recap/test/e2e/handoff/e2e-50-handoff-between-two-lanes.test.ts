import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../support/engine-world.ts';
import { handoffWorld, SOURCE, TARGET, type HandoffWorld } from '../support/handoff-world.ts';

const MINUTE = 60_000;
const DAY = 86_400_000;
const REFERENCE = /^Handoff reference: \d{4}-\d\d-\d\d \d\d:\d\dZ-[0-9a-z]{8}$/mu;
const HEADINGS = ['Freshness', 'Goal', 'Now', 'Needs', 'Done', 'Decisions', 'Next', 'Links', 'Rules'];
const LEDGER = JSON.stringify({ ops: [
    add('goal', 'Add a cart to the shop', 'Add a cart to the shop'),
    add('now', 'Writing the cart tests', 'Writing the cart tests'),
    add('needs', 'Confirm the totals schema', 'Confirm the totals schema'),
    add('done', 'Added totals in src/totals.ts', 'Added totals in src/totals.ts'),
    add('decisions', 'Use the existing lexer', 'Use the existing lexer', 'it already handles the edge cases'),
    add('next', 'Run the gate', 'Run the gate'),
    add('links', 'See src/cart.ts', 'See src/cart.ts'),
    add('rules', 'Keep the public API stable', 'Keep the public API stable'),
] });

const withoutReference = (text: string): string => text.replace(REFERENCE, '');

describe('a handoff from one lane to another', () => {
    let world: HandoffWorld;
    let sent: string;
    let reference: string;

    const handoff = (...args: readonly string[]): ReturnType<HandoffWorld['recap']['world']['command']> => world.recap.world.command('handoff', ...args);
    const stored = (statement: string): readonly Record<string, unknown>[] => world.recap.rows(statement);

    before(async () => {
        world = await handoffWorld({ answers: [LEDGER] });
    });

    after(async () => {
        await world.close();
    });

    test('asks for a handoff from the source to the target: the command says it was delivered and exits 0', { timeout: 30_000 }, async () => {
        const ran = handoff('--from', SOURCE, '--to', TARGET);
        sent = await world.prompted();
        const done = await ran;
        assert.equal(done.code, 0, done.stderr);
        assert.equal(done.stdout, 'tab-recap: handoff delivered to the target lane\n');
        assert.equal(done.stderr, '');
    });

    test('the daemon sent the target one prompt: the preamble, a reference, the freshness and the ledger in section order', () => {
        assert.deepEqual(world.prompts(), [sent]);
        assert.ok(sent.startsWith('I am handing you work another agent was doing.'));
        assert.match(sent, REFERENCE);
        reference = REFERENCE.exec(sent)?.[0] ?? '';
        assert.deepEqual([...sent.matchAll(/^## (.+)$/gmu)].map((match) => match[1]), HEADINGS);
        assert.match(sent, /^last run: \d{4}-\d\d-\d\d \d\d:\d\dZ, after a turn$/mu);
        assert.match(sent, /^lane status: idle$/mu);
        assert.match(sent, /^newer prompts: none$/mu);
        assert.match(sent, /^refresh not requested$/mu);
        assert.match(sent, /^- \d{4}-\d\d-\d\d \d\d:\d\dZ Add a cart to the shop$/mu);
        assert.match(sent, /^- \d{4}-\d\d-\d\d \d\d:\d\dZ Use the existing lexer\n {2}- reason: it already handles the edge cases$/mu);
        assert.ok(sent.endsWith('worksite unavailable'));
        assert.ok(!sent.includes('facts omitted'));
    });

    test('the request was taken and its answer stored as delivered', () => {
        assert.deepEqual(stored("SELECT id FROM request WHERE kind = 'handoff'"), []);
        assert.deepEqual(stored('SELECT outcome, reason FROM handoff_answer_readable'), [{ outcome: 'delivered', reason: null }]);
    });

    test('the daemon log gives the byte count of the prompt and no omitted or withheld facts', () => {
        const line = /handoff hnd_[0-9a-z]{26}: delivered bytes (\d+) omitted 0 withheld 0/u.exec(world.recap.world.log());
        assert.ok(line !== null, world.recap.world.log().slice(-400));
        assert.equal(Number(line[1]), Buffer.byteLength(sent));
    });

    test('the same ledger handed off again carries another reference within the first 400 code points', { timeout: 30_000 }, async () => {
        world.ready();
        const ran = handoff('--from', SOURCE, '--to', TARGET);
        const second = await world.prompted(2);
        assert.equal((await ran).code, 0);
        assert.notEqual(Array.from(second).slice(0, 400).join(''), Array.from(sent).slice(0, 400).join(''));
        assert.notEqual(REFERENCE.exec(second)?.[0], reference);
        assert.equal(withoutReference(second), withoutReference(sent));
        assert.equal(world.prompts().length, 2);
        assert.deepEqual(stored('SELECT outcome FROM handoff_answer_readable'), [{ outcome: 'delivered' }, { outcome: 'delivered' }]);
    });

    test('print writes the same body the daemon sent, under the dry-run reference, and writes no state', { timeout: 30_000 }, async () => {
        const held = [stored("SELECT id FROM request"), stored('SELECT id FROM handoff_answer_readable')];
        const printed = await handoff('--from', SOURCE, '--print');
        assert.equal(printed.code, 0, printed.stderr);
        assert.match(printed.stdout, /^Handoff reference: dry run$/mu);
        assert.equal(printed.stdout.replace(/^Handoff reference: dry run$/mu, ''), `${withoutReference(sent)}\n`);
        assert.equal(printed.stderr, '');
        assert.deepEqual([stored("SELECT id FROM request"), stored('SELECT id FROM handoff_answer_readable')], held);
        assert.equal(world.prompts().length, 2);
    });

    test('print with a target puts the target status on stderr and still prints', { timeout: 30_000 }, async () => {
        world.ready();
        const printed = await handoff('--from', SOURCE, '--to', TARGET, '--print');
        assert.equal(printed.code, 0, printed.stderr);
        assert.equal(printed.stderr, `tab-recap: target ${TARGET}: idle\n`);
        assert.match(printed.stdout, /^## Goal$/mu);
        assert.equal(world.prompts().length, 2);
    });

    test('a note goes above the freshness, and a blank note is no note', { timeout: 30_000 }, async () => {
        const plain = await handoff('--from', SOURCE, '--print');
        const noted = await handoff('--from', SOURCE, '--print', '--note', 'keep the tests');
        const blank = await handoff('--from', SOURCE, '--print', '--note', '   ');
        assert.match(noted.stdout, /^Note: keep the tests$/mu);
        assert.ok(noted.stdout.indexOf('Note: keep the tests') < noted.stdout.indexOf('## Freshness'));
        assert.equal(blank.stdout, plain.stdout);
        assert.doesNotMatch(plain.stdout, /^Note:/mu);
    });

    test('newer prompts are counted as at least that many once the transcript grows, and the wording says so', { timeout: 30_000 }, async () => {
        world.recap.grow(2);
        const printed = await handoff('--from', SOURCE, '--print');
        assert.match(printed.stdout, /^newer prompts: at least 2$/mu);
        assert.match(printed.stdout, /^last run: \d{4}-\d\d-\d\d \d\d:\d\dZ, after a turn$/mu);
    });

    test('a source with no transcript of its own to read says newer prompts are unknown and still reports the lane', { timeout: 30_000 }, async () => {
        const printed = await handoff('--from', TARGET, '--print');
        assert.equal(printed.code, 0, printed.stderr);
        assert.match(printed.stdout, /^lane status: idle$/mu);
        assert.match(printed.stdout, /^newer prompts: unknown$/mu);
    });

    test('closed facts count only inside the closed window: one closed an hour ago is under Recently closed and one closed a month ago is out', { timeout: 30_000 }, async () => {
        const now = Date.now();
        world.seed([
            { section: 'goal', text: 'Add a cart to the shop' },
            { section: 'done', text: 'closed an hour ago', closedAt: now - 60 * MINUTE },
            { section: 'done', text: 'closed a month ago', closedAt: now - 30 * DAY },
        ]);
        const printed = await handoff('--from', SOURCE, '--print');
        assert.equal(printed.code, 0, printed.stderr);
        const closed = printed.stdout.split('## ').find((section) => section.startsWith('Recently closed')) ?? '';
        assert.match(closed, /closed an hour ago/u);
        assert.ok(!printed.stdout.includes('closed a month ago'));
    });

    test('a lane that closed and was replaced by another agent in the same pane is handed off from its closure, not refused as the same lane', { timeout: 30_000 }, async () => {
        const closedAt = Date.now() - 1_000;
        world.write(`INSERT INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name) SELECT 'w1:t1', '${TARGET}', ${closedAt}, 'codex', NULL, (SELECT id FROM task LIMIT 1), 'Cart';`);
        world.ready();
        const ran = handoff('--from-closed', TARGET, '--tab', 'w1:t1', '--closed-at', String(closedAt), '--to', TARGET);
        const closedText = await world.prompted(3);
        const done = await ran;
        assert.equal(done.code, 0, done.stderr);
        assert.equal(done.stdout, 'tab-recap: handoff delivered to the target lane\n');
        assert.match(closedText, /^closed at \d{4}-\d\d-\d\d \d\d:\d\dZ$/mu);
        assert.doesNotMatch(closedText, /lane status/u);
        assert.equal(world.prompts().length, 3);
    });

    test('a ledger that cannot be read fails print and the closed print: the log names the cause code and no path, and stdout stays empty', { timeout: 30_000 }, async () => {
        const closedAt = Date.now() - 500;
        world.write(`INSERT INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name) SELECT 'w1:t1', '${SOURCE}', ${closedAt}, 'claude', NULL, (SELECT id FROM task LIMIT 1), 'Cart';
PRAGMA ignore_check_constraints = ON;
INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) SELECT randomblob(16), 'w1:t1', (SELECT id FROM task LIMIT 1), 'mood', 'a fact the ledger cannot read', NULL, NULL, NULL, ${closedAt - 1000}, ${closedAt - 1000}, 'open', NULL, NULL, (SELECT id FROM run ORDER BY at DESC LIMIT 1), (SELECT id FROM run ORDER BY at DESC LIMIT 1), 'en';
PRAGMA ignore_check_constraints = OFF;`);
        for (const args of [['--from', SOURCE, '--print'], ['--from-closed', SOURCE, '--tab', 'w1:t1', '--closed-at', String(closedAt), '--print']]) {
            const printed = await handoff(...args);
            assert.equal(printed.code, 1, args.join(' '));
            assert.equal(printed.stdout, '');
            assert.match(printed.stderr, /^tab-recap: handoff print: source unreadable \(\w+\)\ntab-recap: 1 — the source transcript could not be read\n$/u, args.join(' '));
            assert.ok(!printed.stderr.includes(world.recap.world.stateDir));
        }
    });
});
