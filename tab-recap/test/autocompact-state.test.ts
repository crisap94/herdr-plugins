import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HistoryFact } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { autocompactState, replyOf } from '#src/recap/application/autocompact-state.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { MUST_BE_LOW, ONE_MUST_BE_HIGH } from '#src/recap/domain/autocompact-verdict.ts';

const fact = (section: string, text: string, over: Partial<HistoryFact> = {}): HistoryFact => ({ section, text, why: null, state: 'open', closedWhy: null, closedAt: null, firstAt: 1, lastAt: 2, ...over });
const FIELDS = ['last_prompt', 'last_reply', 'recent_turns', 'goal', 'open_work'];
const FIXTURES = join(import.meta.dirname, 'fixtures', 'autocompact');
/** the questions with an offer fixture: an offer to the operator is a yes for `closes_request` and a no for `announces_continuation` */
const OFFERS: Readonly<Record<string, true>> = { closes_request: true, announces_continuation: true };

test('the six questions are the ones the verdict uses; each has instructions and both criteria, and names a field in backticks', () => {
    assert.deepEqual(Object.keys(QUESTIONS).toSorted(), [...MUST_BE_LOW, ...ONE_MUST_BE_HIGH].toSorted());
    for (const [id, question] of Object.entries(QUESTIONS)) {
        assert.match(JSON.stringify(question.instructions), /`(last_prompt|last_reply|recent_turns|goal|open_work)`/, id);
        assert.ok(JSON.stringify(question.criteria.true).length > 10 && JSON.stringify(question.criteria.false).length > 10, id);
    }
});

test('every question has a yes and a no fixture holding exactly the state fields, and every field is named by a question', () => {
    assert.deepEqual(readdirSync(FIXTURES).toSorted(), Object.keys(QUESTIONS).toSorted());
    for (const id of Object.keys(QUESTIONS)) {
        assert.deepEqual(readdirSync(join(FIXTURES, id)).toSorted(), ['no.json', 'yes.json', ...(id in OFFERS ? ['offer.json'] : [])].toSorted(), id);
        for (const name of ['yes', 'no', ...(id in OFFERS ? ['offer'] : [])]) {
            assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(FIXTURES, id, `${name}.json`), 'utf8')) as object), FIELDS, `${id}/${name}`);
        }
    }
    const text = JSON.stringify(QUESTIONS);
    for (const field of FIELDS) assert.ok(text.includes(`\`${field}\``), `no question names ${field}`);
    assert.deepEqual(Object.keys(autocompactState([], [])), FIELDS, 'the builder produces no other field');
});

test('the state: last prompt and reply, the last six turns (tools as kind: command, clipped), the newest open goal, at most 12 open now/next/needs', () => {
    const entries: Entry[] = [
        { role: 'user', text: 'first' }, { role: 'agent', text: 'a1' }, { role: 'user', text: 'second' },
        { role: 'tool', text: 'npm test', kind: 'shell' }, { role: 'tool', text: 'x'.repeat(900), kind: 'edit' }, { role: 'agent', text: 'done' }, { role: 'tool', text: 'ls' },
    ];
    const state = autocompactState(entries, [fact('goal', 'new goal'), fact('goal', 'old goal'), fact('now', 'n1'), fact('decisions', 'd'), fact('next', 'x1', { state: 'closed', closedAt: 5 }), fact('needs', 'q1')]);
    assert.equal(state.last_prompt, 'second');
    assert.equal(state.last_reply, 'done');
    assert.equal(state.recent_turns.length, 6);
    assert.deepEqual(state.recent_turns.map((turn) => turn.text.slice(0, 12)), ['a1', 'second', 'shell: npm t', `edit: ${'x'.repeat(6)}`, 'done', 'other: ls']);
    assert.equal(state.recent_turns[3]?.text.length, 600);
    assert.equal(state.goal, 'new goal');
    assert.deepEqual(state.open_work, [{ section: 'now', text: 'n1' }, { section: 'needs', text: 'q1' }]);
    const many = autocompactState([], Array.from({ length: 20 }, (_, i) => fact('next', `t${i}`)));
    assert.equal(many.open_work.length, 12);
    assert.equal(autocompactState([], [fact('now', 'only')]).goal, null);
    assert.deepEqual([autocompactState([], []).last_prompt, autocompactState([], []).last_reply], [null, null]);
});

test('a long reply keeps its first 600 and last 1 200 characters around […]', () => {
    const long = `${'a'.repeat(600)}${'m'.repeat(500)}${'z'.repeat(1200)}`;
    assert.equal(replyOf(long), `${'a'.repeat(600)}[…]${'z'.repeat(1200)}`);
    assert.equal(replyOf('short'), 'short');
});

test('an offer to the operator closes the request and is not a continuation: the criteria say so, and both offer fixtures end with the offer', () => {
    assert.match(JSON.stringify(QUESTIONS['closes_request']?.criteria.true), /offer/);
    assert.match(JSON.stringify(QUESTIONS['announces_continuation']?.instructions), /waits for the operator/);
    for (const id of Object.keys(OFFERS)) {
        const offer = JSON.parse(readFileSync(join(FIXTURES, id, 'offer.json'), 'utf8')) as { last_reply: string };
        assert.match(offer.last_reply, /\?$/, id);
    }
});
