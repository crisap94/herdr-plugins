import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF_INSTRUCTIONS } from '#src/adapters/brief-instructions.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { BriefDesk, clean, FORBIDDEN, vetted } from '#src/recap/application/compaction-brief.ts';
import { MESSAGE_LIMIT as BRIEF_LIMIT } from '#src/recap/application/compaction-message.ts';
import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { duration } from '#src/recap/domain/time.ts';
import { compactJobOf, COMPACT_DEFAULT, placementOf } from '#src/recap/domain/job.ts';

const models = { claude: 'haiku', codex: 'gpt-6-luna', opencode: '', hermes: '', custom: '' };
const config = (values: Record<string, string>): ((key: string) => string | undefined) => (key) => values[key];

test('the brief is trimmed, folded to one line and kept whole under the limit', () => {
    assert.deepEqual(vetted('  I want X.\n\nWe chose   Y because Z.  '), { kind: 'ok', text: 'I want X. We chose Y because Z.' });
});

test('an empty answer and one that names the plugin are refused, whatever the case', () => {
    assert.equal(vetted('  \n ').kind, 'bad');
    for (const word of ['recap', 'Recap', 'recaps', 'plugin', 'Herdr', 'tab', 'tabs']) {
        const verdict = vetted(`We keep the ${word} here.`);
        assert.equal(verdict.kind, 'bad', word);
    }
    assert.equal(vetted('We keep the tabular data and the stable tabs-free layout.').kind, 'bad', 'a whole word `tabs` is matched');
    assert.equal(vetted('We keep the tabular data and the tabletop layout.').kind, 'ok', 'a word that merely contains `tab` is not');
});

test('an answer over 3 000 characters is cut at the last sentence end before the limit', () => {
    const sentence = 'We decided to keep the schema as it is. ';
    const verdict = vetted(sentence.repeat(200));
    assert.ok(verdict.kind === 'ok' && verdict.text.length <= BRIEF_LIMIT && verdict.text.endsWith('as it is.'));
    const unbroken = vetted('x'.repeat(5000));
    assert.ok(unbroken.kind === 'ok' && unbroken.text.length <= BRIEF_LIMIT);
});

test('the writer is told the same words the brief is held to', () => {
    assert.ok(BRIEF_INSTRUCTIONS.includes('3000') && BRIEF_INSTRUCTIONS.includes('first person') && BRIEF_INSTRUCTIONS.includes('WITH its reason'));
    assert.ok(FORBIDDEN.test('a recap') && !FORBIDDEN.test('a summary'));
});

function desk(writer: CompactionBriefs | null, log: string[] = []): BriefDesk {
    return new BriefDesk({ writer: () => writer, log: (line) => { log.push(line); } });
}
const answering = (text: string): CompactionBriefs => ({ backend: 'codex/gpt-6-luna', job: 'codex · gpt-6-luna · high', write: () => Promise.resolve({ kind: 'briefed', text }) });

test('the desk returns a usable brief; no writer means no brief and no log; a failing or refused one is logged with its reason', async () => {
    assert.deepEqual(await desk(answering('I want X.')).write('<doc/>'), { text: 'I want X.', why: null });
    assert.equal(desk(answering('I want X.')).job(), 'codex · gpt-6-luna · high');
    const quiet: string[] = [];
    assert.deepEqual(await desk(null, quiet).write('<doc/>'), { text: null, why: null });
    assert.equal(desk(null).job(), null);
    assert.equal(desk(null).enabled(), false);
    assert.deepEqual(quiet, []);
    const log: string[] = [];
    const failing: CompactionBriefs = { backend: 'codex/gpt-6-luna', job: 'codex · gpt-6-luna · high', write: () => Promise.resolve(unknown({ why: 'timeout', after: duration(120_000) })) };
    assert.deepEqual(await desk(failing, log).write('<doc/>'), { text: null, why: 'timed out after 120000 ms' });
    assert.deepEqual(await desk(answering('a plugin said so'), log).write('<doc/>'), { text: null, why: 'the answer says "plugin"' });
    assert.match(log[0] ?? '', /codex\/gpt-6-luna gave none \(timed out after 120000 ms\); the template is used/);
    assert.match(log[1] ?? '', /the answer says "plugin"/);
});

test('the brief job: recap harness, its model, high effort until told otherwise', () => {
    assert.deepEqual(compactJobOf(config({})), COMPACT_DEFAULT);
    assert.deepEqual(COMPACT_DEFAULT, { by: 'recap', model: '', effort: 'high' });
    assert.deepEqual(compactJobOf(config({ TAB_RECAP_COMPACT_BY: ' Codex ', TAB_RECAP_COMPACT_MODEL: ' gpt-6-luna ', TAB_RECAP_COMPACT_EFFORT: 'MEDIUM' })), { by: 'codex', model: 'gpt-6-luna', effort: 'medium' });
    assert.deepEqual(compactJobOf(config({ TAB_RECAP_COMPACT_BY: 'nonsense', TAB_RECAP_COMPACT_EFFORT: 'max' })), COMPACT_DEFAULT, 'unknown values are the defaults');
    assert.equal(compactJobOf(config({ TAB_RECAP_COMPACT_EFFORT: 'default' })).effort, 'default');
    assert.equal(compactJobOf(config({ TAB_RECAP_COMPACT_BY: 'off' })).by, 'off');
});

test('where the brief runs: `recap` inherits the recap writer\'s harness and model; an empty model is the harness\'s configured one; off and a missing harness mean the template', () => {
    const recap = { backend: 'codex' as const, models };
    assert.deepEqual(placementOf(COMPACT_DEFAULT, recap, ['claude', 'codex']), { harness: 'codex', model: 'gpt-6-luna', effort: 'high' });
    assert.deepEqual(placementOf({ by: 'claude', model: 'sonnet', effort: 'medium' }, recap, ['claude']), { harness: 'claude', model: 'sonnet', effort: 'medium' });
    assert.deepEqual(placementOf({ by: 'claude', model: '', effort: 'high' }, recap, ['claude']), { harness: 'claude', model: 'haiku', effort: 'high' });
    assert.deepEqual(placementOf(COMPACT_DEFAULT, { backend: 'auto', models }, ['codex']), { harness: 'codex', model: 'gpt-6-luna', effort: 'high' }, 'recap on auto picks what is installed');
    assert.equal(placementOf({ by: 'off', model: '', effort: 'high' }, recap, ['codex']), null);
    assert.equal(placementOf({ by: 'auto', model: '', effort: 'high' }, recap, []), null);
});

test('the instructions tell the writer what a settled line is and to name those lines in one line without re-opening them', () => {
    assert.match(BRIEF_INSTRUCTIONS, /settled="yes"[^]*one line as settled[^]*not ask it to keep them as open work or re-open them/);
});

test('golden: the brief writer\'s instructions are exactly the reviewed text', () => {
    assert.equal(BRIEF_INSTRUCTIONS, readFileSync(new URL('fixtures/brief-instructions.txt', import.meta.url), 'utf8').trimEnd());
});

test('forbidden words are relative to the conversation: a word the agent\'s own text uses is allowed, the others are not', () => {
    const own = 'Fix the browser tab that crashes; the plugin loader is in src/plugins.';
    assert.equal(vetted('We fix the tab crash and the plugin loader.', own).kind, 'ok', 'a word in the own text is kept');
    assert.equal(vetted('We fix the tabs crash.', own).kind, 'ok', 'its plural is the same word');
    assert.deepEqual(vetted('We fix the tab crash and the recap.', own), { kind: 'bad', why: 'the answer says "recap"' }, 'a word the conversation never uses is refused');
    assert.equal(vetted('Ask herdr.', own).kind, 'bad');
    assert.equal(vetted('We fix the tab crash.').kind, 'bad', 'with no conversation the old rule holds');
});

test('tab-recap and recap column stay refused unless the conversation itself contains them', () => {
    assert.deepEqual(vetted('Keep the tab-recap column.', 'a tab opens, a recap is a thing'), { kind: 'bad', why: 'the answer says "tab-recap"' });
    assert.equal(vetted('Keep the tab-recap project.', 'we maintain tab-recap in this repo').kind, 'ok');
    assert.deepEqual(vetted('Hide the recap column.', 'the recap of the tab'), { kind: 'bad', why: 'the answer says "recap column"' });
    assert.equal(vetted('Hide the recap column.', 'we hide the Recap column on phones').kind, 'ok');
});

test('the template obeys the same rule: recap items with a refused word are left out, unless the conversation uses it', () => {
    const sections = { ...NO_SECTIONS, goal: 'Ship the cart rewrite', decisions: ['Keep SQLite', 'The recap column shows 3 lines'], next: ['Fix the browser tab leak', 'Ask herdr'], rules: ['Never push to main'] };
    assert.deepEqual(clean(sections, ''), { ...NO_SECTIONS, goal: 'Ship the cart rewrite', decisions: ['Keep SQLite'], rules: ['Never push to main'] });
    const kept = clean(sections, 'the browser tab leaks');
    assert.deepEqual(kept.next, ['Fix the browser tab leak']);
    assert.deepEqual(clean({ ...NO_SECTIONS, goal: 'Reduce the recap noise' }, '').goal, '', 'a goal with a refused word is left out');
});
