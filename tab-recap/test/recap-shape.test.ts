import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headlineOf, parseRecap, renderRecap, tidy } from '#src/recap/application/recap-shape.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';

const sections = (found: ReturnType<typeof parseRecap>): RecapSections => {
    assert.ok(found.kind === 'sections', found.kind === 'invalid' ? found.why : '');
    return found.sections;
};

test('parser: a well-formed answer comes through; missing sections are empty; extra keys are ignored', () => {
    const got = sections(parseRecap('{"goal":"ship the uploader","now":["running CI"],"needs":["approve the deploy"],"extra":"x","links":["upload.ts"]}'));
    assert.deepEqual(got, { goal: 'ship the uploader', now: ['running CI'], needs: ['approve the deploy'], done: [], decisions: [], next: [], links: ['upload.ts'], rules: [] });
});

test('parser: the answer may be fenced or wrapped in a sentence — the JSON is found inside', () => {
    assert.equal(sections(parseRecap('```json\n{"goal":"a"}\n```')).goal, 'a');
    assert.equal(sections(parseRecap('Here is the recap: {"goal":"b","now":["c"]} Hope it helps!')).now[0], 'c');
});

test('parser: caps — Now 3, Needs you 3, Done 5, Decisions 3, Next 5, Links 6 bullets', () => {
    const many = Array.from({ length: 9 }, (_, i) => `item ${i}`);
    const got = sections(parseRecap(JSON.stringify({ goal: 'g', now: many, needs: many, done: many, decisions: many, next: many, links: many })));
    assert.deepEqual([got.now.length, got.needs.length, got.done.length, got.decisions.length, got.next.length, got.links.length], [3, 3, 5, 3, 5, 6]);
    assert.deepEqual(got.done, ['item 0', 'item 1', 'item 2', 'item 3', 'item 4'], 'the first ones are kept');
});

test('parser: a line is at most 16 words, clipped with an ellipsis; bullets, bold and runs of spaces are tidied', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const got = sections(parseRecap(JSON.stringify({ goal: long, now: [`- **running**   CI\non !940`, long] })));
    assert.equal(got.goal, `${Array.from({ length: 16 }, (_, i) => `w${i}`).join(' ')}…`);
    assert.equal(got.now[0], 'running CI on !940');
    assert.equal(got.now[1]?.split(' ').length, 16);
    assert.equal(tidy('exactly sixteen words here one two three four five six seven eight nine ten'), 'exactly sixteen words here one two three four five six seven eight nine ten');
});

test('parser: placeholders, empties and non-strings are dropped; a lone string counts as one bullet', () => {
    const got = sections(parseRecap('{"goal":"—","now":["none","","-",5,null,"real"],"needs":"one thing","done":[["nested"]],"links":"N/A"}'));
    assert.deepEqual([got.goal, got.now, got.needs, got.done, got.links], ['', ['real'], ['one thing'], [], []]);
});

test('parser: not JSON, no object, or none of the seven sections is invalid — and says why', () => {
    for (const bad of ['', 'I could not do that', '{"goal": ', '[1,2]', '{"foo":1}', '"text"']) {
        const found = parseRecap(bad);
        assert.equal(found.kind, 'invalid', bad);
    }
    assert.match(parseRecap('{"goal": ').kind === 'invalid' ? (parseRecap('{"goal": ') as { why: string }).why : '', /not valid JSON|no JSON object/);
});

test('renderer: golden output in English with empty sections as —', () => {
    const text = renderRecap({ ...NO_SECTIONS, goal: 'Ship the uploader', now: ['Running CI on !940'], done: ['Added backoff to upload.ts', 'Tests pass'], links: ['upload.ts', '!940'] }, 'en');
    assert.equal(text, [
        '## Goal', 'Ship the uploader', '',
        '## Now', '- Running CI on !940', '',
        '## Needs you', '—', '',
        '## Done', '- Added backoff to upload.ts', '- Tests pass', '',
        '## Decisions', '—', '',
        '## Next', '—', '',
        '## Links', '- upload.ts', '- !940',
    ].join('\n'));
});

test('renderer: golden output in Spanish, everything empty', () => {
    assert.equal(renderRecap(NO_SECTIONS, 'es'), ['Objetivo', 'Ahora', 'Te necesita', 'Hecho', 'Decisiones', 'Siguiente', 'Enlaces'].map((heading) => `## ${heading}\n—`).join('\n\n'));
});

test('headline: what needs the operator first, else what is happening now, else nothing — read from the data', () => {
    assert.deepEqual(headlineOf({ ...NO_SECTIONS, needs: ['approve the deploy'], now: ['running CI'] }), { kind: 'needs', text: 'approve the deploy' });
    assert.deepEqual(headlineOf({ ...NO_SECTIONS, now: ['running CI', 'second'] }), { kind: 'now', text: 'running CI' });
    assert.equal(headlineOf(NO_SECTIONS), null);
});

test('render then parse never loses the data (the previous recap goes back to the writer as JSON)', () => {
    const original: RecapSections = { goal: 'g', now: ['a'], needs: ['b'], done: ['c', 'd'], decisions: ['e'], next: ['f'], links: ['g.ts'], rules: ['h'] };
    assert.deepEqual(sections(parseRecap(JSON.stringify(original))), original);
});

test('the JSON contract survives every summarizer\'s way of handing the answer back', async () => {
    const { resultOf } = await import('#src/adapters/claude-harness.ts');
    const { opencodeOutput } = await import('#src/adapters/opencode-harness.ts');
    const { unfenced } = await import('#src/adapters/recap-prompt.ts');
    const answer = JSON.stringify({ goal: 'ship it', now: ['running CI'], needs: ['approve the deploy'] });
    const fenced = `\`\`\`json\n${answer}\n\`\`\``;
    // claude: `--output-format json` wraps the model's text in a `result` field — the contract JSON is inside it
    const claude = resultOf(JSON.stringify({ type: 'result', result: fenced, total_cost_usd: 0.01 }));
    assert.ok(claude !== null);
    assert.equal(sections(parseRecap(unfenced(claude.text))).goal, 'ship it');
    // opencode: NDJSON events, the answer split over two `text` parts
    const half = Math.floor(answer.length / 2);
    const events = [answer.slice(0, half), answer.slice(half)].map((text) => JSON.stringify({ type: 'text', sessionID: 's', part: { text } })).join('\n');
    assert.equal(sections(parseRecap(unfenced(opencodeOutput(events).text))).needs[0], 'approve the deploy');
    // codex (the -o file), hermes and custom (stdout): plain text, possibly fenced
    for (const raw of [answer, fenced, `\n\n${fenced}\n`]) {
        assert.equal(sections(parseRecap(unfenced(raw))).now[0], 'running CI');
    }
});

test('parser: rules — at most 5, each at most 16 words, never drawn', () => {
    const long = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    const many = Array.from({ length: 8 }, (_, i) => `rule ${i}`);
    const got = sections(parseRecap(JSON.stringify({ goal: 'g', rules: [long, ...many] })));
    assert.equal(got.rules.length, 5);
    assert.equal(got.rules[0]?.split(' ').length, 16);
    assert.ok(!renderRecap({ ...NO_SECTIONS, rules: ['never push to main'] }, 'en').includes('never push'), 'a rule is stored, not drawn');
    assert.equal(parseRecap('{"rules":["only a rule"]}').kind, 'invalid', 'rules alone are not a recap');
});
