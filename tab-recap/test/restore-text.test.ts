import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { ClaudeTranscripts } from '#src/adapters/transcripts/claude/transcripts.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { createEngine } from '#src/recap/application/engine.ts';
import type { RestoreFacts } from '#src/recap/application/engine.ts';
import { HANDOFF_BUDGET_BYTES } from '#src/recap/application/handoff-limits.ts';
import { restoreContentOf, restoreTextOf } from '#src/recap/application/restore-text.ts';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import { SECTION_IDS } from '#src/recap/domain/fact.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { isForbidden } from '#src/recap/domain/handoff-vetting.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { HANDOFF_PREAMBLE } from '#src/recap/render/handoff-markdown.ts';
import { fitRestore } from '#src/recap/render/restore-markdown.ts';
import type { RestoreBody, RestoreContent } from '#src/recap/domain/restore-content.ts';
import { NO_REPOS } from '#test/support.ts';
import { closureOf } from '#test/support/closure.ts';
import { writer } from '#test/fakes/golden-writer.ts';
import { fact } from './fakes/fact-at.ts';

const AT = Date.parse('2026-10-10T12:00:00Z');
const MINUTE = 60_000;
const HAND_OVER = /\b(ledger|agents?|tools?|handoffs?|hand(ing|ed)? over|another)\b/iu;
const HOST_SIDE: ReadonlySet<string> = new Set(['src/ports/tab-views.ts', 'src/ports/pane-tokens.ts', 'src/recap/application/handoff-print.ts', 'src/recap/application/handoff-source.ts', 'src/recap/application/handoff-pipeline.ts']);

const factsOf = (open: readonly Fact[], closed: readonly Fact[] = [], lastRunAt: number | null = AT): RestoreFacts => ({
    at: instant(AT + MINUTE),
    lastRun: lastRunAt === null ? null : { at: lastRunAt, cause: 'turn-ended' },
    open,
    closed,
});

const ENGLISH: RestoreFacts = factsOf(
    [
        fact('f1', 'goal', 'Add a cart to the shop', AT - 50 * MINUTE),
        fact('f2', 'done', 'Added cart totals in src/totals.ts', AT - 40 * MINUTE),
        fact('f3', 'decisions', 'Store carts in SQLite', AT - 30 * MINUTE, { why: 'the shop already ships SQLite' }),
        fact('f4', 'next', 'Write the checkout form', AT - 20 * MINUTE),
        fact('f5', 'links', 'Opened !34 for feat/cart', AT - 10 * MINUTE),
    ],
    [fact('f6', 'needs', 'Wait for the price API key', AT - 45 * MINUTE, { state: 'closed', closedWhy: 'done', closedAt: AT - 5 * MINUTE })],
);

const SPANISH: RestoreFacts = factsOf(
    [
        fact('f1', 'goal', 'Añadir un carrito a la tienda', AT - 50 * MINUTE, { language: 'es' }),
        fact('f2', 'now', 'Revisando el cálculo del IVA en src/iva.ts', AT - 15 * MINUTE, { language: 'es' }),
        fact('f3', 'decisions', 'Guardar los carritos en SQLite', AT - 30 * MINUTE, { why: 'la tienda ya usa SQLite', language: 'es' }),
    ],
);

test('golden: an English ledger is put back as my own notes, in the first person, grouped like the handoff', () => {
    assert.equal(
        restoreTextOf(ENGLISH),
        [
            'These are my notes on where my work stood, last brought up to date at 2026-10-10 12:00Z. They can lag behind what happened after that: I check them against the worktree before I rely on them.',
            '',
            '## Goal',
            '- 2026-10-10 11:10Z Add a cart to the shop',
            '',
            '## Done',
            '- 2026-10-10 11:20Z Added cart totals in src/totals.ts',
            '',
            '## Decisions',
            '- 2026-10-10 11:30Z Store carts in SQLite',
            '  - reason: the shop already ships SQLite',
            '',
            '## Next',
            '- 2026-10-10 11:40Z Write the checkout form',
            '',
            '## Links',
            '- 2026-10-10 11:50Z Opened !34 for feat/cart',
            '',
            '## Recently closed',
            '- 2026-10-10 11:15Z Wait for the price API key',
            '  - closed: done',
        ].join('\n'),
    );
});

test('golden: a Spanish ledger keeps its facts in Spanish under the same English frame the handoff uses', () => {
    assert.equal(
        restoreTextOf(SPANISH),
        [
            'These are my notes on where my work stood, last brought up to date at 2026-10-10 12:00Z. They can lag behind what happened after that: I check them against the worktree before I rely on them.',
            '',
            '## Goal',
            '- 2026-10-10 11:10Z Añadir un carrito a la tienda',
            '',
            '## Now',
            '- 2026-10-10 11:45Z Revisando el cálculo del IVA en src/iva.ts',
            '',
            '## Decisions',
            '- 2026-10-10 11:30Z Guardar los carritos en SQLite',
            '  - reason: la tienda ya usa SQLite',
        ].join('\n'),
    );
});

const bodyOf = (content: RestoreContent): RestoreBody => (content.kind === 'content' ? content : assert.fail('expected content, got empty'));

test('the restore template names no plugin word and no hand-over to another agent, whatever the facts', () => {
    const open = SECTION_IDS.map((section, at) => fact(`o${at}`, section, `${section} the plain text`, AT - at * MINUTE, section === 'decisions' ? { why: 'a plain reason' } : {}));
    const more = Array.from({ length: 16 }, (_, at) => fact(`d${at}`, 'done', `finished step ${at}`, AT - (20 + at) * MINUTE));
    const closed = [fact('c1', 'now', 'a closed plain text', AT - MINUTE, { state: 'closed', closedWhy: 'answered', closedAt: AT })];
    const withheld = fact('w1', 'next', 'Show the recap in a tab', AT);
    const fitted = fitRestore(bodyOf(restoreContentOf(factsOf([...open, ...more, withheld], closed))), byteBudgetOf(HANDOFF_BUDGET_BYTES));
    const text = fitted.kind === 'text' ? fitted.text : assert.fail('expected a text');
    for (const section of ['## Goal', '## Now', '## Needs', '## Done', '## Decisions', '## Next', '## Links', '## Rules', '## Recently closed']) {
        assert.ok(text.includes(section), section);
    }
    assert.ok(text.endsWith('3 older notes left out'), text);
    const template = text.split('\n').filter((line) => !line.startsWith('- ') && !line.startsWith('  - ')).join('\n');
    assert.equal(isForbidden(sanitizeHandoffText(text)), false, text);
    assert.equal(HAND_OVER.test(text), false, text);
    assert.equal(HAND_OVER.test(template), false, template);
    assert.ok(HAND_OVER.test(HANDOFF_PREAMBLE), 'the probe bites the handoff preamble it must tell apart');
});

test('an empty ledger, a scope never run, or facts that are all withheld give an empty text', () => {
    assert.equal(restoreTextOf(factsOf([])), '');
    assert.equal(restoreTextOf(factsOf([fact('f1', 'goal', 'a goal', AT)], [], null)), '');
    assert.equal(restoreTextOf(factsOf([fact('f1', 'goal', 'Show the recap in a tab', AT)])), '');
    assert.equal(restoreTextOf(factsOf([], [fact('f1', 'now', 'long ago', AT, { state: 'closed', closedWhy: 'superseded', closedAt: AT - 3 * 3_600_000 })])), '');
});

test('the restore text stays within the handoff budget, dropping the oldest of now and next first and saying how many it left out', () => {
    const long = 'x'.repeat(900);
    const open = Array.from({ length: 40 }, (_, at) => fact(`n${at}`, 'now', `${long} ${at}`, AT - at * MINUTE));
    const text = restoreTextOf(factsOf([fact('g', 'goal', 'the goal', AT - 99 * MINUTE), ...open]));
    assert.ok(new TextEncoder().encode(text).byteLength <= HANDOFF_BUDGET_BYTES);
    assert.ok(text.includes('the goal'));
    assert.match(text, /\d+ older notes left out$/u);
    assert.ok(text.includes(`${long} 0`), 'the newest is kept');
    assert.equal(fitRestore(bodyOf(restoreContentOf(factsOf([fact('g', 'goal', long, AT)]))), byteBudgetOf(10)).kind, 'too-large');
});

test('the restore path runs on the engine\'s store and a scope and followed session only: no tab view, no pane token, no same-lane refusal', async () => {
    const closure = await closureOf('src/recap/application/restore-text.ts');
    assert.ok(closure.includes('src/recap/render/restore-markdown.ts'));
    assert.deepEqual(closure.filter((file) => HOST_SIDE.has(file)), []);
    const turns = readFileSync(join(import.meta.dirname, 'fixtures', 'replay-claude.jsonl'), 'utf8').split('\n').filter((line) => line !== '');
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-restore-'));
    const scratch = scratchStore();
    try {
        const records = join(dir, 'projects', '-plain', '00000000-0000-4000-8000-000000000002.jsonl');
        mkdirSync(dirname(records), { recursive: true });
        writeFileSync(records, '');
        const reader = new ClaudeTranscripts(dirname(dirname(records)));
        const scope = tabId('00000000-0000-4000-8000-000000000002');
        const session = laneFrom({ paneId: String(scope), tabId: String(scope), workspaceId: 'plain', agent: reader.agent, session: basename(records, '.jsonl') });
        const clock = { now: 1 };
        const { summarizer } = writer();
        const engine = createEngine({
            source: { transcripts: new TranscriptRegistry({ [reader.agent]: reader }, null, (kind): string => capabilityWording('history-unavailable', kind)) },
            store: { records: scratch.store.records, ledger: scratch.store.ledger },
            models: { summarizer: () => summarizer },
            environment: { clock: { now: (): Instant => instant(clock.now) }, repos: NO_REPOS, log: () => undefined },
            settings: { language: (): string => 'en', writerView: () => FULL_WRITER_VIEW },
        });
        assert.equal(restoreTextOf(engine.restore(scope, session)), '', 'nothing is restored before the first run');
        for (const turn of [0, 1, 2]) {
            const lines = turns.slice(turn * 2, turn * 2 + 2);
            appendFileSync(records, lines.map((line) => `${line}\n`).join(''));
            clock.now = Math.max(clock.now + 1, ...lines.map((line) => Date.parse((JSON.parse(line) as { timestamp: string }).timestamp)).filter((at) => !Number.isNaN(at)));
            await engine.refresh(scope, [session]);
        }
        const restored = engine.restore(scope, session);
        const text = restoreTextOf(restored);
        assert.ok(text.startsWith('These are my notes on where my work stood'), text);
        for (const shown of restored.open) {
            assert.ok(text.includes(shown.text), shown.text);
        }
        assert.ok(restored.open.length > 0);
        const other = laneFrom({ paneId: 'someone-else', tabId: String(scope), workspaceId: 'plain', agent: reader.agent, session: 'other' });
        assert.equal(restoreTextOf(engine.restore(scope, other)), '', 'a session the scope never followed gets nothing back');
    } finally {
        scratch.dispose();
        rmSync(dir, { recursive: true, force: true });
    }
});
