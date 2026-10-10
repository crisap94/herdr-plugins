import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbered } from '#src/recap/application/ledger-input.ts';
import { agentOf } from '#test/support.ts';
import { factOf } from './fakes/facts.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';

const [old, fresh] = [factOf('now', 'Old', { lastAt: 10 }), factOf('now', 'Fresh', { lastAt: 90, agent: 'orchestrator' })];
const shut = factOf('done', 'Shut', { state: 'closed', closedWhy: 'done', closedAt: 95, lastAt: 95 });
const other = factOf('goal', 'Other task');

test('ids run f1…fn across the document: a task\'s open facts oldest seen first (newest last), then those it closed lately', () => {
    const numbering = numbered([{ key: 't1', open: [fresh, old], closed: [shut] }, { key: 't2', open: [other], closed: [] }], [agentOf('a1', { label: 'orchestrator' })], true, FULL_WRITER_VIEW, 0);
    assert.deepEqual(numbering.ledgers.map((ledger) => [ledger.task, ledger.facts.map((fact) => [fact.id, fact.text, fact.state])]), [
        ['t1', [['f1', 'Old', 'open'], ['f2', 'Fresh', 'open'], ['f3', 'Shut', 'closed']]], ['t2', [['f4', 'Other task', 'open']]],
    ]);
    assert.equal(numbering.byId.get('f2'), fresh);
    assert.deepEqual([numbering.taskOf.get('f3'), numbering.taskOf.get('f4')], ['t1', 't2']);
    assert.equal(numbering.shown.get('t2')?.get('f4'), other);
});

test('a fact names its agent by id when the tab lists an agent with that label, else by none; a single task has no task attribute', () => {
    const named = numbered([{ key: 't1', open: [fresh, old], closed: [] }], [agentOf('a1', { label: 'orchestrator' })], false, FULL_WRITER_VIEW, 0);
    assert.deepEqual(named.ledgers[0]?.facts.map((fact) => [fact.text, fact.agent]), [['Old', null], ['Fresh', 'a1']]);
    assert.equal(named.ledgers.at(0)?.task, null);
    assert.equal(numbered([{ key: 't1', open: [fresh], closed: [] }], [agentOf('a1', { label: '' })], false, FULL_WRITER_VIEW, 0).ledgers[0]?.facts[0]?.agent, null, 'an agent with no label cannot be matched');
});
