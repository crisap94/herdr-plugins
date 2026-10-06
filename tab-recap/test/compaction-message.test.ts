import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidanceOf, MESSAGE_LIMIT, restoreOf } from '#src/recap/application/compaction-message.ts';
import type { Material } from '#src/recap/application/compaction-message.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';

const web = { base: 'https://git.example/team/app', forge: 'gitlab', branch: 'feat/cart' } as const;
const sections = {
    ...NO_SECTIONS, goal: 'Ship the cart rewrite', now: ['Running the checkout tests'], needs: ['Should guests keep their basket?'],
    decisions: ['Use sqlite, it needs no server'], next: ['Open the merge request'], rules: ['Never push to main'], links: ['!252', '`src/cart.ts`'],
};
const material = (over: Partial<Material> = {}): Material => ({ sections, web, note: null, ...over });

const many = (label: string): string[] => Array.from({ length: 5 }, (_, at) => `${label} ${at} ${'x'.repeat(90)}`);
const FORBIDDEN = /recap|\btabs?\b|tool/iu;

test('golden: the guidance with a note is ONE line, numbered, references as URLs', () => {
    assert.equal(guidanceOf(material({ note: 'the failing retry test' })), [
        'When you summarize this conversation, keep these, most important first:',
        '(1) Above all, keep: the failing retry test',
        '(2) What I want: Ship the cart rewrite',
        '(3) Decisions we made, and why: Use sqlite, it needs no server.',
        '(4) Questions waiting for my answer: Should guests keep their basket?',
        '(5) Unfinished work and next steps: Running the checkout tests; Open the merge request.',
        '(6) Standing rules I gave you: Never push to main.',
        '(7) Exact references to keep as written: !252 (https://git.example/team/app/-/merge_requests/252); src/cart.ts (https://git.example/team/app/-/blob/feat/cart/src/cart.ts).',
        'Drop raw command output, the details of steps that are finished, and dead ends we already resolved.',
    ].join(' '));
    assert.ok(!/[\r\n]/u.test(guidanceOf(material({ note: 'a\nb' }))), 'no line break, whatever the note holds');
});

test('a skipped note leaves no trace, and empty priorities are omitted', () => {
    const text = guidanceOf(material({ note: '   ', sections: { ...NO_SECTIONS, goal: 'Fix the login bug' } }));
    assert.equal(text, ['When you summarize this conversation, keep these, most important first:', '(1) What I want: Fix the login bug', 'Drop raw command output, the details of steps that are finished, and dead ends we already resolved.'].join(' '));
    assert.ok(!/above all|note/iu.test(text));
});

test('golden: the restore message for an agent whose compaction takes no instructions', () => {
    assert.equal(restoreOf(material({ sections: { ...NO_SECTIONS, goal: 'Ship the cart rewrite', rules: ['Never push to main'] } })), [
        'We just compacted this conversation. This is where things stand:',
        '- What I want: Ship the cart rewrite',
        '- Standing rules I gave you: Never push to main.',
        'Keep these in mind from here on. Nothing needs doing yet: do not start anything or run any command, just answer "ok".',
    ].join('\n'));
});

test('over the limit: references go first, then next steps, then decisions; the note and the goal stay whole', () => {
    const big = { ...sections, links: many('ref'), next: many('next'), now: [], decisions: many('decision'), needs: [], rules: [] };
    const text = guidanceOf(material({ sections: big, note: 'keep the note whole' }));
    assert.ok(text.length <= MESSAGE_LIMIT, String(text.length));
    assert.ok(text.includes('keep the note whole') && text.includes('Ship the cart rewrite'));
    assert.ok(!text.includes('ref 4') && text.includes('next 4'), 'references are cut first, from the end');
    assert.ok(text.includes('decision 4'), 'decisions are whole while references can still give');
    const tighter = guidanceOf(material({ sections: { ...big, decisions: many('decision').map((line) => line + 'y'.repeat(200)) }, note: 'n' }));
    assert.ok(tighter.length <= MESSAGE_LIMIT && !tighter.includes('next 0'), 'next steps go before decisions');
});

test('the agent never hears about the plugin: no template, with or without a note, names it', () => {
    for (const text of [guidanceOf(material({ note: 'x' })), guidanceOf(material()), restoreOf(material({ note: 'x' })), restoreOf(material()), guidanceOf(material({ sections: NO_SECTIONS })), restoreOf(material({ sections: NO_SECTIONS }))]) {
        assert.ok(!FORBIDDEN.test(text), text);
    }
});

test('references stay as written when the lane has no web context', () => {
    assert.ok(guidanceOf(material({ web: null })).includes('Exact references to keep as written: !252; src/cart.ts.'));
});
