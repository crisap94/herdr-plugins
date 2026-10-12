import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HandoffAnswers } from '#src/ports/handoff-answers.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { memoryStore } from './db/support.ts';
import { MemoryHandoffAnswers } from './fakes/handoff-answers.ts';

interface Subject {
    readonly name: string;
    readonly make: (clock: { now: number }) => HandoffAnswers;
}

const subjects: readonly Subject[] = [
    { name: 'SQLite', make: (clock) => memoryStore({ now: () => clock.now }).handoffs },
    { name: 'in-memory double', make: (clock) => new MemoryHandoffAnswers(() => clock.now) },
];

for (const { name, make } of subjects) {
    test(`${name}: a delivered answer has no reason and a failed answer keeps its storable reason`, () => {
        const clock = { now: 10 };
        const answers = make(clock);
        const [delivered, failed] = [handoffIdOf(ids.next()), handoffIdOf(ids.next())];
        answers.answerHandoff(delivered, { kind: 'delivered' });
        answers.answerHandoff(failed, { kind: 'failed', reason: 'interrupted' });
        const deliveredRow = { id: delivered, at: 10, kind: 'delivered', reason: null };
        assert.deepEqual(answers.handoffAnswer(delivered), deliveredRow);
        assert.deepEqual(answers.handoffAnswer(delivered), deliveredRow, 'reading never deletes');
        assert.deepEqual(answers.handoffAnswer(failed), { id: failed, at: 10, kind: 'failed', reason: 'interrupted' });
    });

    test(`${name}: an unknown handoff has no answer`, () => {
        assert.equal(make({ now: 1 }).handoffAnswer(handoffIdOf(ids.next())), null);
    });

    test(`${name}: one answer per handoff id: a second answer is a no-op and the first verdict stands`, () => {
        const clock = { now: 1 };
        const answers = make(clock);
        const id = handoffIdOf(ids.next());
        answers.answerHandoff(id, { kind: 'failed', reason: 'interrupted' });
        clock.now = 9;
        answers.answerHandoff(id, { kind: 'delivered' });
        assert.deepEqual(answers.handoffAnswer(id), { id, at: 1, kind: 'failed', reason: 'interrupted' });
    });

    test(`${name}: prune removes answers older than the cut and keeps the rest`, () => {
        const clock = { now: 1 };
        const answers = make(clock);
        const [old, recent] = [handoffIdOf(ids.next()), handoffIdOf(ids.next())];
        answers.answerHandoff(old, { kind: 'delivered' });
        clock.now = 50;
        answers.answerHandoff(recent, { kind: 'delivered' });
        answers.prune(50);
        assert.equal(answers.handoffAnswer(old), null);
        assert.equal(answers.handoffAnswer(recent)?.at, 50);
    });
}
