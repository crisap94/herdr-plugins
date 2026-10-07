import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headlineOf, objectIn, renderRecap, tidy } from '#src/recap/application/recap-shape.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';

test('tidy: a line is at most 16 words, clipped with an ellipsis; bullets, bold and runs of spaces are tidied; a limit can be given', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    assert.equal(tidy(long), `${Array.from({ length: 16 }, (_, i) => `w${i}`).join(' ')}…`);
    assert.equal(tidy('- **running**   CI\non !940'), 'running CI on !940');
    assert.equal(tidy('exactly sixteen words here one two three four five six seven eight nine ten'), 'exactly sixteen words here one two three four five six seven eight nine ten');
    assert.equal(tidy(long, 24).split(' ').length, 24);
});

test('tidy: placeholders and empties are nothing', () => {
    for (const none of ['', '—', 'none', 'N/A', 'nada', '-']) {
        assert.equal(tidy(none), '', none);
    }
});

test('objectIn: the answer may be fenced or wrapped in a sentence — the JSON is found inside; none found is undefined; broken JSON throws', () => {
    assert.deepEqual(objectIn('```json\n{"ops":[]}\n```'), { ops: [] });
    assert.deepEqual(objectIn('Here you go: {"ops":[{"op":"close","id":"f1","why":"done"}]} Hope it helps!'), { ops: [{ op: 'close', id: 'f1', why: 'done' }] });
    assert.equal(objectIn('I could not do that'), undefined);
    assert.throws(() => objectIn('{"ops": [}'));
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

const opsOf = (text: string): number => (objectIn(text) as { ops: unknown[] }).ops.length;

test('the operations contract survives every summarizer\'s way of handing the answer back', async () => {
    const { resultOf } = await import('#src/adapters/claude-harness.ts');
    const { opencodeOutput } = await import('#src/adapters/opencode-harness.ts');
    const { unfenced } = await import('#src/adapters/recap-prompt.ts');
    const answer = JSON.stringify({ ops: [{ op: 'add', section: 'now', text: 'running CI' }, { op: 'close', id: 'f2', why: 'done' }] });
    const fenced = `\`\`\`json\n${answer}\n\`\`\``;
    // claude: `--output-format json` wraps the model's text in a `result` field — the contract JSON is inside it
    const claude = resultOf(JSON.stringify({ type: 'result', result: fenced, total_cost_usd: 0.01 }));
    assert.ok(claude !== null);
    assert.equal(opsOf(unfenced(claude.text)), 2);
    // opencode: NDJSON events, the answer split over two `text` parts
    const half = Math.floor(answer.length / 2);
    const events = [answer.slice(0, half), answer.slice(half)].map((text) => JSON.stringify({ type: 'text', sessionID: 's', part: { text } })).join('\n');
    assert.equal(opsOf(unfenced(opencodeOutput(events).text)), 2);
    // codex (the -o file), hermes and custom (stdout): plain text, possibly fenced
    for (const raw of [answer, fenced, `\n\n${fenced}\n`]) {
        assert.equal(opsOf(unfenced(raw)), 2);
    }
});

test('rules are stored, not drawn', () => {
    assert.ok(!renderRecap({ ...NO_SECTIONS, rules: ['never push to main'] }, 'en').includes('never push'));
});
