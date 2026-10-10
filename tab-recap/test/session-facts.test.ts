import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { SCREEN_READER_ID } from '#src/adapters/screen-transcripts.ts';
import assert from 'node:assert/strict';
import { EditCache, EditCounts, countEdits } from '#src/recap/application/edit-counts.ts';
import { sessionFactsOf } from '#src/recap/domain/session-facts.ts';
import type { SessionInputs } from '#src/recap/domain/session-facts.ts';
import { en } from '#src/i18n/en.ts';
import type { Messages } from '#src/i18n/messages.ts';
import { es } from '#src/i18n/es.ts';
import { sessionLines, spanOf } from '#src/recap/render/session-lines.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { cursor } from '#test/db/support.ts';

const NOW = Date.parse('2026-10-07T16:30:00Z');
const at = (clock: string, day = '2026-10-07'): number => Date.parse(`${day}T${clock}:00Z`);
const nothing: SessionInputs = { firstSeen: null, now: NOW, runs: {}, compactions: [], lanes: [], webs: [], edits: [] };
const lines = (input: SessionInputs, locale: Messages = en): string[] => sessionLines(sessionFactsOf(input), { now: NOW, zone: 'UTC', messages: locale }).map((line) => `${line.label} ${line.text}`);

test('nothing known: no line at all, never a guess', () => {
    assert.deepEqual(lines(nothing), []);
    assert.deepEqual(sessionFactsOf(nothing), { started: null, runs: null, compactions: null, agents: [], repo: null, files: [], chapters: null, autocompact: null });
});

test('started: the first time the tab was seen and for how long; another day says the date', () => {
    assert.deepEqual(lines({ ...nothing, firstSeen: at('09:12') }), ['started 09:12 · 7 h 18 min']);
    assert.deepEqual(lines({ ...nothing, firstSeen: at('16:29') }), ['started 16:29 · 1 min']);
    assert.deepEqual(lines({ ...nothing, firstSeen: at('22:00', '2026-10-05') }), ['started 2026-10-05 22:00 · 1 d 18 h']);
    assert.deepEqual(lines({ ...nothing, firstSeen: NOW + 5000 }), ['started 16:30 · 0 min'], 'a clock that runs backwards is zero');
    assert.deepEqual([0, 59_999, 3_600_000, 90_000_000].map(spanOf), ['0 min', '0 min', '1 h', '1 d 1 h']);
});

test('turns: the runs by cause, the causes with none left out, imported runs not counted', () => {
    assert.deepEqual(lines({ ...nothing, runs: { 'turn-ended': 36, focused: 3, requested: 2 } }), ['turns 41 (turn 36 · focus 3 · asked 2)']);
    assert.deepEqual(lines({ ...nothing, runs: { 'turn-ended': 4, imported: 9 } }), ['turns 4 (turn 4)']);
    assert.deepEqual(lines({ ...nothing, runs: { imported: 9 } }), []);
    assert.deepEqual(lines({ ...nothing, runs: { focused: 1 } }, es), ['turnos 1 (foco 1)']);
});

test('compactions: how many, with the tokens of those that say; a count alone when none says', () => {
    assert.deepEqual(lines({ ...nothing, compactions: [{ tokensBefore: 800_000, tokensAfter: 14_000, origin: 'operator' }, { tokensBefore: 39_000, tokensAfter: 3_000, origin: 'operator' }] }), ['compactions 2 (2 by you) (800k → 14k · 39k → 3k)']);
    assert.deepEqual(lines({ ...nothing, compactions: [{ tokensBefore: 1_200_000, tokensAfter: 20_000, origin: 'operator' }, { tokensBefore: null, tokensAfter: null, origin: 'operator' }] }), ['compactions 2 (2 by you) (1.2M → 20k)']);
    assert.deepEqual(lines({ ...nothing, compactions: [{ tokensBefore: null, tokensAfter: 3000, origin: 'operator' }] }), ['compactions 1 (1 by you)']);
});

test('compactions by origin: the operator\'s and autocompact\'s counted apart, zeros left out, in both languages', () => {
    const mixed: SessionInputs = { ...nothing, compactions: [{ tokensBefore: 800_000, tokensAfter: 14_000, origin: 'operator' }, { tokensBefore: 600_000, tokensAfter: 9_000, origin: 'auto' }, { tokensBefore: null, tokensAfter: null, origin: 'operator' }, { tokensBefore: null, tokensAfter: null, origin: 'operator' }] };
    assert.deepEqual(lines(mixed), ['compactions 4 (3 by you · 1 auto) (800k → 14k · 600k → 9k)']);
    assert.deepEqual(lines({ ...nothing, compactions: [{ tokensBefore: null, tokensAfter: null, origin: 'auto' }] }), ['compactions 1 (1 auto)']);
    assert.deepEqual(lines(mixed, es), ['compactaciones 4 (3 por ti · 1 auto) (800k → 14k · 600k → 9k)']);
    assert.deepEqual(sessionFactsOf(mixed).compactions?.byOrigin, { operator: 3, auto: 1 });
});

test('each agent\'s context share; an agent whose context is unknown has no line', () => {
    const lanes = [
        { agent: 'claude', label: 'orchestrator', context: { tokens: 340_000, window: 1_000_000, source: 'table' as const } },
        { agent: 'codex', label: null, context: { tokens: 32_640, window: 272_000, source: 'agent' as const } },
        { agent: 'opencode', label: 'x', context: null },
    ];
    assert.deepEqual(lines({ ...nothing, lanes }), ['claude · orchestrator 34 % of 1M', 'codex 12 % of 272k']);
    assert.deepEqual(lines({ ...nothing, lanes }, es), ['claude · orchestrator 34 % de 1M', 'codex 12 % de 272k']);
});

test('repository and branch: from the lane that knows its web context; a detached head has no branch; none, no line', () => {
    assert.deepEqual(lines({ ...nothing, webs: [null, { base: 'https://git.example/group/herdr-plugins', branch: 'feat/expanded' }] }), ['repo herdr-plugins · branch feat/expanded']);
    assert.deepEqual(lines({ ...nothing, webs: [{ base: 'https://github.com/acme/shop/', branch: null }] }), ['repo shop']);
    assert.deepEqual(lines({ ...nothing, webs: [null] }), []);
});

test('files: the most edited first, five at most', () => {
    const edits = Array.from({ length: 8 }, (_, index) => ({ path: `src/f${index}.ts`, count: 8 - index }));
    assert.deepEqual(lines({ ...nothing, edits }), ['files src/f0.ts (8), src/f1.ts (7), src/f2.ts (6), src/f3.ts (5), src/f4.ts (4)']);
});

test('edit counts: per path, most edited first, ties by path', () => {
    assert.deepEqual(countEdits(['b.ts', 'a.ts', 'b.ts', 'c.ts', 'a.ts']), [{ path: 'a.ts', count: 2 }, { path: 'b.ts', count: 2 }, { path: 'c.ts', count: 1 }]);
    assert.deepEqual(countEdits([]), []);
});

const reader = (agent: string, entries: readonly { role: 'tool' | 'agent'; kind?: 'edit' | 'shell'; text: string }[] | 'unreadable'): Transcripts => ({
    agent, inFlight: { kind: 'unsupported', why: 'unregistered-reader' }, locate: () => Promise.resolve({ kind: 'located', source: 'x' }), latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
    read: () => Promise.resolve(entries === 'unreadable' ? unknown({ why: 'unreadable', detail: 'x' }) : { kind: 'chunk', entries, title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 0, tail: null }, grew: false }),
});

test('edit calls are counted through each lane\'s own reader; screens, unreadable records and other calls count nothing', async () => {
    const counts = new EditCounts(registryWith({
        claude: reader('claude', [{ role: 'tool', kind: 'edit', text: 'src/a.ts' }, { role: 'tool', kind: 'edit', text: 'src/a.ts' }, { role: 'tool', kind: 'shell', text: 'npm test' }, { role: 'agent', text: 'src/a.ts' }]),
        codex: reader('codex', 'unreadable'),
    }, reader(SCREEN_READER_ID, [{ role: 'tool', kind: 'edit', text: 'src/b.ts' }])));
    const lanes = [cursor('w1:p1'), { ...cursor('w1:p2'), agent: 'codex' }, { ...cursor('w1:p3'), agent: 'gemini' }, { ...cursor('w1:p4'), transcript: 'screen:w1:p4' }, { ...cursor('w1:p5'), transcript: '' }];
    assert.deepEqual(await counts.of(lanes), [{ path: 'src/a.ts', count: 2 }, { path: 'src/b.ts', count: 1 }]);
    assert.deepEqual(await new EditCounts(registryWith({})).of(lanes), []);
});

test('the cache answers at once with what it has and refreshes in the background once a minute', async () => {
    let reads = 0;
    const entries = [{ role: 'tool' as const, kind: 'edit' as const, text: 'src/a.ts' }];
    const counting: Transcripts = { ...reader('claude', entries), read: (...args) => { reads += 1; return reader('claude', entries).read(...args); } };
    const cache = new EditCache(new EditCounts(registryWith({ claude: counting })), 60_000);
    assert.deepEqual(cache.of([cursor('w1:p1')], 0), [], 'the first look does not wait');
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.deepEqual(cache.of([cursor('w1:p1')], 1000), [{ path: 'src/a.ts', count: 1 }]);
    assert.equal(reads, 1, 'not again within a minute');
    cache.of([cursor('w1:p1')], 60_000);
    assert.equal(reads, 2);
});

test('autocompact: decisions, compactions and waits once the tab has any; none, no line', () => {
    assert.deepEqual(lines({ ...nothing, autocompact: { decisions: 12, compacted: 3, waited: 9 } }), ['autocompact 12 decisions · 3 compacted · 9 waited']);
    assert.deepEqual(lines({ ...nothing, autocompact: { decisions: 1, compacted: 0, waited: 1 } }), ['autocompact 1 decision · 0 compacted · 1 waited']);
    assert.deepEqual(lines({ ...nothing, autocompact: { decisions: 1, compacted: 1, waited: 0 } }, es), ['autocompactar 1 decisión · 1 compactada · 0 en espera']);
    assert.deepEqual(lines({ ...nothing, autocompact: { decisions: 0, compacted: 0, waited: 0 } }), []);
});
