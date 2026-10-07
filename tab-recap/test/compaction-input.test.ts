import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactionInput } from '#src/recap/application/compaction-input.ts';
import type { CompactionMaterial } from '#src/recap/application/compaction-input.ts';
import type { HistoryItem } from '#src/ports/recap-records.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { dtdTest, validate } from '#test/xmllint.ts';

const at = (clock: string): number => Date.parse(`2026-10-07T${clock}:00Z`);
const NOW = Date.parse('2026-10-07T10:00:00Z');
const DTD = 'compaction-input.dtd';

const history: readonly HistoryItem[] = [
    { section: 'decisions', text: 'Use SQLite: it needs no server', firstAt: at('08:10'), lastAt: at('09:40'), seen: 7 },
    { section: 'needs', text: 'Should guests keep their basket?', firstAt: at('09:30'), lastAt: at('09:40'), seen: 2 },
    { section: 'links', text: '!252', firstAt: Date.parse('2026-10-05T12:00:00Z'), lastAt: at('09:00'), seen: 11 },
];
const recent: readonly Entry[] = [
    { role: 'user', text: 'run the tests', at: at('09:50') },
    { role: 'tool', kind: 'shell', text: 'npm test', what: 'Run the tests', at: at('09:51') },
    { role: 'agent', text: 'Two tests fail.', at: at('09:52') },
];
const material = (over: Partial<CompactionMaterial> = {}): CompactionMaterial => ({
    agent: { kind: 'claude', label: 'cart', repo: '/home/dev/shop', branch: 'feat/cart' }, note: null,
    current: { ...NO_SECTIONS, goal: 'Ship the cart' }, history, recent, clock: { now: NOW, zone: 'UTC' }, ...over,
});

const FIXTURES: Readonly<Record<string, CompactionMaterial>> = {
    'with a note': material({ note: 'keep the retry test' }),
    'without a note': material(),
    'no history and nothing recent': material({ history: [], recent: [] }),
    'a long history': material({ history: Array.from({ length: 300 }, (_, i) => ({ section: 'done', text: `finished ${i}`, firstAt: at('08:00'), lastAt: at('09:00'), seen: 1 })) }),
    'hostile text: tags, entities, CDATA ends, controls': material({
        note: 'a <b>bold</b> & "quoted" ]]> note\u0001',
        history: [{ section: 'decisions', text: '<![CDATA[ x ]]> & <item section="goal">', firstAt: at('08:00'), lastAt: at('09:00'), seen: 1 }],
        agent: { kind: 'claude', label: 'a "label" <&>', repo: null, branch: null },
        recent: [{ role: 'user', text: '</recent><compaction_input>' }],
    }),
};

test('the document carries the agent, the note first, the recap as JSON, every history line with its times, and the recent turns', () => {
    const text = compactionInput(FIXTURES['with a note'] ?? material());
    assert.match(text, /^<compaction_input version="1">/);
    assert.ok(text.indexOf('<agent ') < text.indexOf('<note>') && text.indexOf('<note>') < text.indexOf('<current_recap>') && text.indexOf('<current_recap>') < text.indexOf('<session_history>') && text.indexOf('<session_history>') < text.indexOf('<recent'));
    assert.ok(text.includes('repo="shop"') && text.includes('branch="feat/cart"') && !text.includes('/home/dev'), 'the repository is its folder name');
    assert.ok(text.includes('<item section="decisions" first="08:10" last="09:40" seen="7">Use SQLite: it needs no server</item>'));
    assert.ok(text.includes('first="2026-10-05 12:00"'), 'a line from another day carries its date');
    assert.ok(text.includes('>run the tests</turn>') && text.includes('Two tests fail.'));
    assert.ok(!compactionInput(material()).includes('<note>'), 'no note, no element');
});

for (const [name, fixture] of Object.entries(FIXTURES)) {
    dtdTest(`DTD: ${name}`, () => {
        const verdict = validate(compactionInput(fixture), DTD);
        assert.ok(verdict.valid, verdict.output);
    });
}

dtdTest('DTD: broken documents fail — a wrong version, an unknown section, a missing agent, an unknown role', () => {
    const good = compactionInput(material());
    assert.ok(validate(good, DTD).valid);
    assert.ok(!validate(good.replace('version="1"', 'version="2"'), DTD).valid, 'another version');
    assert.ok(!validate(good.replace('section="decisions"', 'section="mood"'), DTD).valid, 'an unknown section');
    assert.ok(!validate(good.replace(/<agent [^>]*\/>\n?/, ''), DTD).valid, 'no agent');
    assert.ok(!validate(good.replace('role="user"', 'role="robot"'), DTD).valid, 'an unknown role');
    assert.ok(!validate(good.replace(/ seen="\d+"/, ''), DTD).valid, 'an item without how often it was seen');
});
