import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { add, engineWorld, type EngineWorld } from '../support/engine-world.ts';

const idOf = (document: string, text: string): string => new RegExp(`<fact id="(f\\d+)"[^>]*>${text}</fact>`).exec(document)?.[1] ?? '';
const THIRTY = Array.from({ length: 30 }, (_, at) => `step${at}`).join(' ');
const WHY = Array.from({ length: 40 }, (_, at) => `reason${at}`).join(' ');

describe('the model writes a narrator line, a decision with no reason, a duplicate and a link that is a description', () => {
    let world: EngineWorld;
    let first = '';
    let second = '';

    before(async () => {
        world = engineWorld({ title: 'orchestrator' });
        world.script({ kind: 'text', text: JSON.stringify({ ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop'), add('decisions', 'Store carts in SQLite', 'Use SQLite for it, no server', 'no server needed'), add('done', 'Added totals in src/totals.ts', 'Added totals in src/totals.ts')] }) });
        world.grow(3);
        await world.engine.refresh(world.scope, [world.lane]);
        const dup = add('done', 'Added totals in src/totals.ts today', 'open a merge request');
        world.script(
            {
                kind: 'text',
                text: `Here you go:\n\`\`\`json\n${JSON.stringify({ ops: [
                    add('done', 'claude completed the merge request for the cart.', 'open a merge request'),
                    add('done', 'orchestrator opened the merge request.', 'open a merge request'),
                    { op: 'add', section: 'done', text: 'Wrote the cart model in src/cart.ts.' },
                    add('next', 'Las pruebas fallan después de la fusión.', 'cookie is fine'),
                    add('next', 'It still fails on the second run.', 'cookie is fine'),
                    add('decisions', 'Guests keep their basket in a cookie.', 'cookie is fine'),
                    dup,
                    add('links', 'the thing from before', 'cookie is fine'),
                    add('done', '- **Opened** !34 for feat/cart.', 'Opened   !34 for\nfeat/cart, the pipeline is running'),
                    add('next', 'Wait for the pipeline of !34 to turn green.', 'opened !34 for feat/cart'),
                    { op: 'close', id: 'f2', why: 'answered' },
                    add('next', THIRTY, 'cookie is fine'),
                    { op: 'update', id: 'f3', text: 'Added totals and tests in src/totals.ts', anchor: 'ADDED TOTALS IN SRC/TOTALS.TS' },
                    { op: 'rename', id: 'f1' },
                    { op: 'add', section: 'rules', text: 'Never push to main', anchor: 'cookie is fine' },
                ] })}\n\`\`\``,
            },
            { kind: 'ops', ops: [add('done', 'The cart merge request is open.', 'open a merge request'), add('decisions', 'Guests keep their basket in a cookie.', 'cookie is fine', WHY), add('next', 'Wait for the pipeline of !34 to turn green.', 'Opened !34 for feat/cart'), dup] },
        );
        world.grow(3);
        await world.engine.refresh(world.scope, [world.lane]);
        [first, second] = [world.documents()[1] ?? '', world.documents()[2] ?? ''];
    });

    after(() => {
        world.close();
    });

    const reasonOf = (operation: string): string => new RegExp(`${operation}[^<]*</operation>\\s*<reason gate="(G\\d+)">`).exec(second)?.[1] ?? 'none';

    test('the first answer, fenced and wrapped in a sentence, is read, and the model is called once more', { timeout: 30_000 }, () => {
        assert.equal(world.asked.length, 3);
        assert.deepEqual([1, 2, 3].map((id) => idOf(first, ['Add a cart to the shop', 'Store carts in SQLite', 'Added totals in src/totals.ts'][id - 1] ?? '')), ['f1', 'f2', 'f3']);
    });

    test('a line about what the agent did is refused by G1', { timeout: 30_000 }, () => {
        assert.equal(reasonOf('claude completed the merge request for the cart\\.'), 'G1');
    });

    test('a decision with no reason is refused by G3', { timeout: 30_000 }, () => {
        assert.equal(reasonOf('Guests keep their basket in a cookie\\.'), 'G3');
        const kept = world.facts().filter((fact) => fact.section === 'decisions');
        assert.deepEqual(kept.map((fact) => fact.text), ['Store carts in SQLite', 'Guests keep their basket in a cookie.']);
    });

    test('a repeat of a fact in the ledger is refused by G2 naming the fact to update, and is dropped when the model repeats it', { timeout: 30_000 }, () => {
        assert.match(second, /<reason gate="G2">it repeats f3 \("Added totals in src\/totals\.ts"\): update f3 instead of adding it<\/reason>/);
        assert.ok(second.includes('<fact id="f3" section="done"'), 'the fact it repeats is shown');
        assert.equal(world.runs().at(-1)?.gates.refused['G2'], 2);
        assert.equal(world.runs().at(-1)?.gates.dropped, 1);
        assert.ok(!world.facts().some((fact) => fact.text === 'Added totals in src/totals.ts today'));
    });

    test('a link that is a description is flagged, kept, and not sent back', { timeout: 30_000 }, () => {
        assert.ok(world.facts().some((fact) => fact.section === 'links' && fact.text === 'the thing from before'));
        assert.ok(!second.includes('the thing from before') && !second.includes('G4'));
        assert.equal(world.runs().at(-1)?.gates.flagged['G4'], 1);
    });

    test('a quote is found by its words whatever the spacing and punctuation, and not whatever the case', { timeout: 30_000 }, () => {
        assert.ok(world.facts().some((fact) => fact.text === 'Opened !34 for feat/cart.'), 'the bullet and the bold are tidied away');
        assert.equal(reasonOf('Wait for the pipeline of !34 to turn green\\.'), 'G11');
        assert.match(second, /anchor="opened !34 for feat\/cart"/);
        assert.ok(!second.includes('Opened   !34'), 'the spaced quote passed');
    });

    test('an add with no anchor is refused by G11 and asked to copy a quote', { timeout: 30_000 }, () => {
        assert.match(second, /<operation op="add" section="done">Wrote the cart model in src\/cart\.ts\.<\/operation>\s*<reason gate="G11">the anchor is missing: copy a quote of at most 120 characters/);
    });

    test('an update with a quote in the wrong case is refused by G11 and the fact keeps its text', { timeout: 30_000 }, () => {
        assert.match(second, /<operation op="update" id="f3"[^>]*>Added totals and tests in src\/totals\.ts<\/operation>\s*<reason gate="G11">/);
        assert.deepEqual(world.facts().filter((fact) => fact.text.startsWith('Added totals')).map((fact) => fact.text), ['Added totals in src/totals.ts']);
    });

    test('a line in another language than the recap is refused by G5, and a line that opens with a pronoun is flagged and kept', { timeout: 30_000 }, () => {
        assert.equal(reasonOf('Las pruebas fallan después de la fusión\\.'), 'G5');
        assert.ok(world.facts().some((fact) => fact.text === 'It still fails on the second run.'));
        assert.ok(!second.includes('It still fails'));
    });

    test('a lane label is a narrator too', { timeout: 30_000 }, () => {
        assert.equal(reasonOf('orchestrator opened the merge request\\.'), 'G1');
    });

    test('closing a decision as answered is refused by G12 and the decision stays open', { timeout: 30_000 }, () => {
        assert.match(second, /<operation op="close" id="f2" closed="answered"\/>\s*<reason gate="G12">f2 is a decisions fact, not a question/);
        assert.deepEqual(world.facts().filter((fact) => fact.text === 'Store carts in SQLite').map((fact) => [fact.state, fact.closedWhy]), [['open', null]]);
    });

    test('an operation that is not one is named and not applied, and a rule is stored', { timeout: 30_000 }, () => {
        assert.match(second, /<problem>"rename" is not an operation: use add, update or close<\/problem>/);
        assert.deepEqual(world.facts().filter((fact) => fact.section === 'rules').map((fact) => fact.text), ['Never push to main']);
    });

    test('the correction holds only the refused operations, the facts they name and no transcript', { timeout: 30_000 }, () => {
        assert.equal((second.match(/<refused>/g) ?? []).length, 9);
        assert.ok(!second.includes('<transcript') && !second.includes('<recap_input') && !second.includes('Opened !34 for feat/cart.'));
        assert.deepEqual([...second.matchAll(/<fact id="(f\d+)"/g)].map((found) => found[1]), ['f2', 'f3']);
    });

    test('a long line is tidied to 16 words and a long reason to 24', { timeout: 30_000 }, () => {
        assert.equal(world.facts().find((fact) => fact.text.startsWith('step0'))?.text, `${Array.from({ length: 16 }, (_, at) => `step${at}`).join(' ')}…`);
        assert.equal(world.facts().find((fact) => fact.why?.startsWith('reason0'))?.why, `${Array.from({ length: 24 }, (_, at) => `reason${at}`).join(' ')}…`);
    });

    test('what passed is stored with what the model sent back, and the run keeps the gate counts and the cost of both calls', { timeout: 30_000 }, () => {
        assert.deepEqual(world.facts().map((fact) => fact.text).toSorted(), [
            'Add a cart to the shop', 'Store carts in SQLite', 'Added totals in src/totals.ts', 'the thing from before', 'Opened !34 for feat/cart.', 'It still fails on the second run.',
            `${Array.from({ length: 16 }, (_, at) => `step${at}`).join(' ')}…`, 'Never push to main', 'The cart merge request is open.', 'Guests keep their basket in a cookie.', 'Wait for the pipeline of !34 to turn green.',
        ].toSorted());
        const run = world.runs().at(-1);
        assert.deepEqual(run?.gates, { refused: { G1: 2, G2: 2, G3: 1, G5: 1, G11: 3, G12: 1 }, flagged: { G4: 1, G8: 2, G9: 1 }, dropped: 1 });
        assert.equal(run.cost, 0.2);
        assert.equal(run.error, null);
    });
});

describe('the model writes times, agents and reasons the answer is read by', () => {
    let world: EngineWorld;
    let correction = '';

    before(async () => {
        world = engineWorld();
        world.script({ kind: 'ops', ops: [add('goal', 'Add a cart to the shop', 'Add a cart to the shop'), add('decisions', 'Store carts in SQLite', 'Use SQLite for it, no server', 'no server needed')] });
        world.grow(2);
        await world.engine.refresh(world.scope, [world.lane]);
        world.script(
            { kind: 'from', answer: (document) => [
                { ...add('done', 'Added totals in src/totals.ts', 'Added totals in src/totals.ts'), at: /<turn role="agent" at="([^"]+)">Added totals/.exec(document)?.[1], agent: 'a9' },
                { op: 'close', id: 'f1', why: 'bored' },
                { op: 'close', id: 'f2', why: 'done' },
            ] },
            { kind: 'ops', ops: [] },
        );
        world.grow(1);
        await world.engine.refresh(world.scope, [world.lane]);
        correction = world.documents()[2] ?? '';
    });

    after(() => {
        world.close();
    });

    test('a time label is resolved to the turn of that local time', { timeout: 30_000 }, () => {
        assert.equal(world.facts().find((fact) => fact.text === 'Added totals in src/totals.ts')?.firstAt, Date.parse('2026-10-07T09:11:00Z'));
    });

    test('an agent the tab does not list is no agent', { timeout: 30_000 }, () => {
        assert.equal(world.facts().find((fact) => fact.text === 'Added totals in src/totals.ts')?.agent, null);
    });

    test('a close that gives a reason outside the four is refused by G10 and the fact stays open', { timeout: 30_000 }, () => {
        assert.match(correction, /<operation op="close" id="f1"\/>\s*<reason gate="G10">closing f1 needs a why/);
        assert.deepEqual(world.facts().filter((fact) => fact.text === 'Add a cart to the shop').map((fact) => fact.state), ['open']);
    });

    test('a close with a reason of the four closes the fact with it', { timeout: 30_000 }, () => {
        assert.deepEqual(world.facts().filter((fact) => fact.text === 'Store carts in SQLite').map((fact) => [fact.state, fact.closedWhy]), [['closed', 'done']]);
        assert.deepEqual(world.runs().at(-1)?.gates.refused, { G10: 1 });
    });
});
