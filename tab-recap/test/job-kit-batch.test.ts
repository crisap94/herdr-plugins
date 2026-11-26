import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batch } from '@stateforge-labs/session-ledger';
import type { KitGround } from '@stateforge-labs/session-ledger';
import { judge } from '@stateforge-labs/session-ledger';
import type { TaskGround } from '@stateforge-labs/session-ledger';
import { LEDGER_GATES } from '@stateforge-labs/session-ledger';
import type { Section } from '@stateforge-labs/session-ledger';
import type { Operation } from '@stateforge-labs/session-ledger';
import { brand } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { factOf } from './fakes/facts.ts';
import { factIdOf } from '@stateforge-labs/session-ledger';

const textOf = brand<string, 'Text'>;
const NOW = 10 * 3_600_000;
const released = factOf('done', 'Released tab-recap 1.10.0 through the pipeline');
const review = factOf('next', 'Review the migration test');
const shut = factOf('done', 'Merged the lint fix', { state: 'closed', closedWhy: 'done', closedAt: instant(NOW - 3_600_000) });

const task: TaskGround = {
    key: textOf('t1'), scope: textOf('w1:t1'), shown: new Map([[textOf('1'), released], [textOf('2'), review]]), open: [released, review], closedLately: [shut], source: textOf('go'), language: textOf('en'), agents: [],
};
const kit: KitGround = { gates: LEDGER_GATES, task, at: instant(NOW) };

const add = (section: Section, text: string, anchor: string | null = 'go'): Operation => ({ op: 'add', section, text: textOf(text), why: null, ref: null, at: null, agent: null, anchor: anchor === null ? null : textOf(anchor) });
const update = (id: string, text: string): Operation => ({ op: 'update', id: factIdOf(id), text: textOf(text), why: null });
const close = (id: string, why: 'done' | 'answered' | null = 'done'): Operation => ({ op: 'close', id: factIdOf(id), why });

const cases: readonly (readonly [string, readonly Operation[], readonly string[]])[] = [
    ['no ops', [], []],
    ['a narrator sentence', [add('next', 'The agent wants the batch driver shipped')], ['G1']],
    ['one good add', [add('next', 'Ship the batch driver behind the writer round')], []],
    ['a repeat of an open fact', [add('next', 'Review the migration test')], ['G2']],
    ['a repeat of a fact closed lately', [add('done', 'Merged the lint fix')], ['G2']],
    ['a repeat inside the same answer', [add('next', 'Write the batch driver tests'), add('next', 'Write the batch driver tests')], ['G2']],
    ['an add plus a close of the fact it repeats', [add('next', 'Review the migration test'), close('2')], []],
    ['an unknown id, a close without why, a close as answered on a non-question, and an update', [update('zz', 'Renamed the thing'), close('1', null), close('2', 'answered'), update('1', 'Released tab-recap 1.10.1 through the pipeline')], ['G10', 'G12', 'G6']],
    ['an anchor not in the source', [add('next', 'Check the anchor handling', 'nowhere')], ['G11']],
    ['two goals, refused by the dry fold', [add('goal', 'Ship the job kit'), add('goal', 'Ship the batch driver')], ['L']],
];

for (const [name, ops, gates] of cases) {
    test(`the writer's batch judges ${name} as one judge call does`, () => {
        const judged = batch('writer', kit, ops);
        assert.deepEqual(judged, judge(LEDGER_GATES, ops, task, instant(NOW)));
        assert.deepEqual([...new Set(judged.refused.map((finding) => finding.gate))].toSorted(), [...gates].toSorted());
    });
}

test('the reconcile batch drops an add and judges the update as one judge call does', () => {
    const bump = update('1', 'Released tab-recap 1.10.1 through the pipeline');
    const ops = [add('next', 'Ship the batch driver behind the writer round'), bump];
    assert.deepEqual(batch('reconcile', kit, ops), judge(LEDGER_GATES, [bump], task, instant(NOW)));
});
