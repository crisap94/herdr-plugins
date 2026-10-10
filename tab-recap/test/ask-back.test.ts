import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InputCandidate, InputFact } from '#src/ports/recap-input.ts';
import { askBackFor, MAX_FACT_QUESTIONS, THIN_CHARS, wanted } from '#src/recap/application/ask-back.ts';
import { JUDGE_INSTRUCTIONS, READBACK_QUESTIONS } from '#src/adapters/judge-instructions.ts';
import { READBACK } from '#src/recap/domain/questions.ts';

const candidate = (section: InputCandidate['section'], text: string, ref: string | null = null): InputCandidate => ({ section, text, why: null, ref, at: null, anchor: 'a', agent: 'a1', flagged: false });
const fact = (id: string, text: string, over: Partial<InputFact> = {}): InputFact => ({ id, section: 'now', text, state: 'open', first: 1, last: 2, why: null, ref: null, anchor: null, agent: null, closed: null, ...over });
const found = (over: Partial<Parameters<typeof askBackFor>[0]> = {}): Parameters<typeof askBackFor>[0] => ({ chunks: 1, chars: 4_000, candidates: [], open: [], said: '', ...over });

test('a second look is due when the run took more than one chunk, or read at least one rate-unit and gave fewer than one candidate per 2 000 characters', () => {
    assert.equal(wanted({ chunks: 2, chars: 100, candidates: [candidate('done', 'x'), candidate('next', 'y')] }), true, 'long');
    assert.equal(wanted({ chunks: 1, chars: 4_000, candidates: [candidate('done', 'x')] }), true, 'thin: 1 per 4 000');
    assert.equal(wanted({ chunks: 1, chars: 4_000, candidates: [candidate('done', 'x'), candidate('next', 'y')] }), false, 'one per 2 000 is enough');
    assert.equal(wanted({ chunks: 1, chars: THIN_CHARS - 1, candidates: [] }), false, 'a short turn cannot be thin');
    assert.equal(wanted({ chunks: 1, chars: THIN_CHARS, candidates: [] }), true);
});

test('no second look, no questions', () => {
    assert.deepEqual(askBackFor(found({ chars: 500 })), []);
    assert.equal(askBackFor(found({ chars: 4_000, candidates: [candidate('done', 'a'), candidate('next', 'b')] })).length, 0, 'rich enough: nothing asked');
    assert.equal(askBackFor(found({ chunks: 2, candidates: [candidate('done', 'a'), candidate('next', 'b')] })).length, 4, 'long: the four open read-back questions');
});

test('the six read-back questions the candidates cannot answer are asked, in order, numbered; an answered one is not', () => {
    const asked = askBackFor(found({ chunks: 2, candidates: [candidate('goal', 'Ship retries'), candidate('decisions', 'Backoff, because it is gentler')] }));
    assert.deepEqual(asked.map((each) => each.text), [READBACK[1], READBACK[2], READBACK[3], READBACK[5]].map((each) => each?.text));
    assert.deepEqual(asked.map((each) => each.id), ['q1', 'q2', 'q3', 'q4']);
    assert.equal(askBackFor(found({ chunks: 3, candidates: READBACK.map((one) => candidate(one.sections[0] ?? 'now', 'Something'))})).length, 0, 'every question answered: no call');
});

test('what changed about an open fact is asked for the facts the turns mention (by reference or by their words) that no candidate speaks of', () => {
    const open = [
        fact('f1', 'Migration test fails on the staging database', { ref: 'test/migrate.test.ts' }),
        fact('f2', 'Review the release notes draft'),
        fact('f3', 'Wire the payments gateway'),
        fact('f4', 'Retry the uploader with backoff'),
        fact('f5', 'Closed already', { state: 'closed' }),
    ];
    const said = 'I ran test/migrate.test.ts again. The release notes draft is ready for review. Retry the uploader now.';
    const asked = askBackFor(found({ chunks: 2, open, said, candidates: [candidate('next', 'Retry the uploader with exponential backoff')] }));
    const about = asked.filter((each) => each.text.startsWith('What changed')).map((each) => each.text);
    assert.deepEqual(about, ['What changed about the open fact "Migration test fails on the staging database"?', 'What changed about the open fact "Review the release notes draft"?'], 'f3 is not mentioned, f4 has a candidate, f5 is closed');
    const many = askBackFor(found({ chunks: 2, said: 'alpha bravo charlie', open: Array.from({ length: 9 }, (_, at) => fact(`f${at}`, 'alpha bravo charlie')) }));
    assert.equal(many.filter((each) => each.text.startsWith('What changed')).length, MAX_FACT_QUESTIONS);
});

test('the six questions are one list: the judge asks the read-back, and grades it, with the very questions the ask-back puts to the enumeration', () => {
    assert.deepEqual(READBACK_QUESTIONS, READBACK.map((each) => each.text));
    assert.equal(READBACK.length, 6);
    for (const task of ['readback', 'grade'] as const) {
        const told = JUDGE_INSTRUCTIONS[task];
        READBACK.forEach((each, at) => { assert.ok(told.includes(`${at + 1}. ${each.text}`), `${task}: ${each.text}`); });
    }
    const asked = askBackFor(found({ chunks: 2 })).map((each) => each.text);
    assert.deepEqual(asked, READBACK.map((each) => each.text), 'with no candidate, all six are asked, in the judge\'s order');
});
