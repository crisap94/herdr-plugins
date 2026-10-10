import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HandoffAnswers } from '#src/ports/handoff-answers.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { memoryStore } from './db/support.ts';

interface Subject {
    readonly name: string;
    readonly make: (clock: { now: number }) => HandoffAnswers;
}

const STORABLE = new Set(['interrupted', 'source-unreadable']);
const storable = (reason: string): boolean => STORABLE.has(reason);

const subjects: readonly Subject[] = [{ name: 'SQLite', make: (clock) => memoryStore({ storable, now: () => clock.now }).handoffs }];

for (const { name, make } of subjects) {
    test(`${name}: a delivered answer has no reason and a failed answer keeps its storable reason`, () => {
        const clock = { now: 10 };
        const answers = make(clock);
        const [delivered, failed] = [handoffIdOf(ids.next()), handoffIdOf(ids.next())];
        answers.answerHandoff(delivered, { outcome: 'delivered', reason: null });
        answers.answerHandoff(failed, { outcome: 'failed', reason: 'interrupted' });
        const deliveredRow = { id: delivered, at: 10, outcome: 'delivered', reason: null };
        assert.deepEqual(answers.handoffAnswer(delivered), deliveredRow);
        assert.deepEqual(answers.handoffAnswer(delivered), deliveredRow, 'reading never deletes');
        assert.deepEqual(answers.handoffAnswer(failed), { id: failed, at: 10, outcome: 'failed', reason: 'interrupted' });
    });

    test(`${name}: an unknown handoff has no answer`, () => {
        assert.equal(make({ now: 1 }).handoffAnswer(handoffIdOf(ids.next())), null);
    });

    test(`${name}: a reason the table does not store is refused and nothing is written`, () => {
        const answers = make({ now: 1 });
        const id = handoffIdOf(ids.next());
        assert.throws(() => { answers.answerHandoff(id, { outcome: 'refused', reason: 'daemon-not-running' }); }, /not storable/);
        assert.equal(answers.handoffAnswer(id), null);
    });

    test(`${name}: one answer per handoff id: a second answer is refused`, () => {
        const answers = make({ now: 1 });
        const id = handoffIdOf(ids.next());
        answers.answerHandoff(id, { outcome: 'refused', reason: 'interrupted' });
        assert.throws(() => { answers.answerHandoff(id, { outcome: 'delivered', reason: null }); });
        assert.equal(answers.handoffAnswer(id)?.outcome, 'refused');
    });

    test(`${name}: prune removes answers older than the cut and keeps the rest`, () => {
        const clock = { now: 1 };
        const answers = make(clock);
        const [old, recent] = [handoffIdOf(ids.next()), handoffIdOf(ids.next())];
        answers.answerHandoff(old, { outcome: 'delivered', reason: null });
        clock.now = 50;
        answers.answerHandoff(recent, { outcome: 'delivered', reason: null });
        answers.prune(50);
        assert.equal(answers.handoffAnswer(old), null);
        assert.equal(answers.handoffAnswer(recent)?.at, 50);
    });
}
