import assert from 'node:assert/strict';
import { test } from 'node:test';
import { curatorInput, documentId, reconcileInput, stillTrueOf, TAIL_CHARS } from '@stateforge-labs/session-ledger/unstable/recap/application/curator-input.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { Fact } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';

const text = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

const NOW = Date.parse('2026-10-07T16:30:00Z');
const clock = { now: instant(NOW), zone: text('UTC') };

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
    id: brand<string, 'FactId'>(id), task: { tab: 'w1:t1', key: 't1' }, section: 'now', text: 'Fix the <build> & ship', why: null, ref: null, agent: null, anchor: null,
    firstAt: NOW - 3_600_000, lastAt: NOW, state: 'open', closedWhy: null, closedAt: null, language: 'en', ...over,
});

const RUBRIC = ['- **I1** keep it short', '- **I7** a fact stays true until the transcript says otherwise', '  more of I7', '- **I8** another rule'].join('\n');

test('facts are named f1 to fn in the order given, with their times, escaped text and closes', () => {
    const closed = fact('b', { state: 'closed', closedWhy: 'done', closedAt: NOW, why: text('shipped') });
    const { document, facts } = curatorInput({ name: text('Docs "&" more'), language: text('es'), rubric: text(RUBRIC), facts: [fact('a'), closed], clock });
    assert.equal(documentId(count(0)), 'f1');
    assert.deepEqual([...facts.keys()], ['f1', 'f2']);
    assert.match(document, /^<curator_input version="1">/);
    assert.match(document, /<task name="Docs &quot;&amp;&quot; more" language="es" now="16:30"\/>/);
    assert.match(document, /<fact id="f1" section="now" state="open" first="15:30" last="16:30"><!\[CDATA\[Fix the <build> & ship\]\]><\/fact>/);
    assert.match(document, /<fact id="f2" section="now" state="closed" first="15:30" last="16:30" why="shipped" closed="done" closedat="16:30">/);
});

test('an empty ledger is a self-closing element and an unnamed task has no name attribute', () => {
    const { document } = curatorInput({ name: text(''), language: text('en'), rubric: text(RUBRIC), facts: [], clock });
    assert.match(document, /<task language="en" now="16:30"\/>/);
    assert.match(document, /<ledger\/>/);
});

test('only the still-true rule of the rubric goes into a reconcile document, with the tail of the transcript', () => {
    assert.equal(stillTrueOf(text(RUBRIC)), '- **I7** a fact stays true until the transcript says otherwise\n  more of I7');
    assert.equal(stillTrueOf(text('- **I1** only')), '');
    assert.ok(TAIL_CHARS > 0);
    const built = reconcileInput({ name: text(''), language: text('en'), rubric: text(RUBRIC), open: [fact('a')], tail: [{ role: 'user', text: text('it still fails'), at: instant(NOW) }], clock });
    assert.match(built.document, /<curator_input version="1" mode="reconcile">/);
    assert.match(built.document, /<tail[^>]*>/);
    assert.ok(!built.document.includes('keep it short'));
    assert.match(built.tail, /it still fails/);
    assert.deepEqual([...built.facts.keys()], ['f1']);
});
