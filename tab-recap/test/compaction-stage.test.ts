import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { tokensOf } from '#src/recap/domain/compaction.ts';
import { clockOf, figuresOf, stageLine } from '#src/recap/render/compaction-stage.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import { coloured, plain, visibleLength } from '#src/recap/render/wrap.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { CompactionRecord } from '#src/ports/compaction-records.ts';
import type { Messages } from '#src/i18n/messages.ts';

const base: CompactionRecord = { id: 'cmp_x', tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'compacting', brief: 'written', writer: 'codex · gpt-6-luna · high', templateWhy: null, startedAt: 0, stageAt: 0, finishedAt: null, tokensBefore: null, tokensAfter: null, tookMs: null, retried: false, why: null };
const done = { finishedAt: 1, tokensBefore: 39532, tokensAfter: 3057, tookMs: 15588 };

/** [name, the record, how long after the stage began, why in each language (the flow stores it in the operator's)] */
const STAGES: readonly (readonly [string, Partial<CompactionRecord>, number])[] = [
    ['briefing', { stage: 'briefing' }, 8000],
    ['compacting', { stage: 'compacting' }, 12_000],
    ['restoring', { stage: 'restoring' }, 3000],
    ['compacted', { stage: 'compacted', ...done }, 0],
    ['compacted with the template', { stage: 'compacted', brief: 'template', ...done }, 0],
    ['compacted, no tokens said', { stage: 'compacted', finishedAt: 1, tookMs: 90_000 }, 0],
    ['failed', { stage: 'failed', finishedAt: 1, why: 'x' }, 0],
    ['unconfirmed', { stage: 'unconfirmed', finishedAt: 1 }, 0],
    ['skipped', { stage: 'skipped', finishedAt: 1, why: 'x' }, 0],
];

const column = (m: Messages, record: CompactionRecord, now: number): string[] => {
    const tab = { tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'Victoria', cwd: null, context: { tokens: 600_000, window: 1_000_000, source: 'catalogue' as const } }] };
    return present({ tab, recap: blankRecap('w1:t1'), notes: new Map(), warnings: [], now, messages: m, compactHint: 40, compactions: [record], style: plain }, 44, () => null).slice(1, 4).filter((line) => line !== '');
};

const bar = (m: Messages, record: CompactionRecord, now: number): string[] => {
    const tab = { tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: null }] };
    return presentBar({ tab, recap: blankRecap('w1:t1'), notes: new Map(), warnings: [], now, messages: m, compactions: [record], style: plain }, 46);
};

const WHY = { en: 'working', es: 'trabajando' } as const;

/** Golden: the lane's header (the status line, then the stage) at the column's width, and the bar's one row, for every stage. */
const GOLDEN = {
    en: {
        column: [
            ['● idle · claude w1:p1', '✎ writing what to keep… (codex · gpt-6-luna', '  · high) 0:08'],
            ['● idle · claude w1:p1', '◐ compacting… 0:12'],
            ['● idle · claude w1:p1', '◐ telling it where things stand…'],
            ['● idle · claude w1:p1', '✓ compacted 39.5k → 3.1k · 16 s'],
            ['● idle · claude w1:p1', '✓ compacted 39.5k → 3.1k · 16 s · template'],
            ['● idle · claude w1:p1', '✓ compacted 1 min 30 s'],
            ['● idle · claude w1:p1', '✗ not compacted: working'],
            ['● idle · claude w1:p1', '? not confirmed — check it'],
            ['● idle · claude w1:p1', '– not compacted: working'],
        ],
        bar: [
            '📝● ✎ writing what claude keeps… 0:08', '📝● ◐ compacting claude… 0:12', '📝● ◐ telling claude where things stand…', '📝● ✓ claude compacted 39.5k → 3.1k · 16 s',
            '📝● ✓ claude compacted 39.5k → 3.1k · 16 s', '📝● ✓ claude compacted 1 min 30 s', '📝● ✗ claude not compacted: working', '📝● ? claude not confirmed — check it', '📝● – claude not compacted: working',
        ],
    },
    es: {
        column: [
            ['● en pausa · claude w1:p1', '✎ escribiendo qué conservar… (codex ·', '  gpt-6-luna · high) 0:08'],
            ['● en pausa · claude w1:p1', '◐ compactando… 0:12'],
            ['● en pausa · claude w1:p1', '◐ recordándole cómo van las cosas…'],
            ['● en pausa · claude w1:p1', '✓ compactado 39.5k → 3.1k · 16 s'],
            ['● en pausa · claude w1:p1', '✓ compactado 39.5k → 3.1k · 16 s · plantilla'],
            ['● en pausa · claude w1:p1', '✓ compactado 1 min 30 s'],
            ['● en pausa · claude w1:p1', '✗ no se compactó: trabajando'],
            ['● en pausa · claude w1:p1', '? sin confirmar — revísalo'],
            ['● en pausa · claude w1:p1', '– no se compactó: trabajando'],
        ],
        bar: [
            '📝● ✎ escribiendo qué conserva claude… 0:08', '📝● ◐ compactando claude… 0:12', '📝● ◐ recordándole a claude cómo van las', '📝● ✓ claude compactado 39.5k → 3.1k · 16 s',
            '📝● ✓ claude compactado 39.5k → 3.1k · 16 s', '📝● ✓ claude compactado 1 min 30 s', '📝● ✗ claude no se compactó: trabajando', '📝● ? claude sin confirmar — revísalo', '📝● – claude no se compactó: trabajando',
        ],
    },
} as const;

for (const [locale, m] of [['en', en], ['es', es]] as const) {
    test(`golden (${locale}): every stage on the lane's header (column) and on the bar's headline`, () => {
        STAGES.forEach(([name, patch, after], at) => {
            const record: CompactionRecord = { ...base, ...patch, ...(patch.why === undefined ? {} : { why: WHY[locale] }) };
            assert.deepEqual(column(m, record, after), GOLDEN[locale].column[at], `${name}: column`);
            assert.deepEqual(bar(m, record, after), [GOLDEN[locale].bar[at]], `${name}: bar`);
            assert.ok(column(m, record, after).every((line) => visibleLength(line) <= 44));
        });
    });
}

test('the stage replaces the hint while it is shown and the hint is back after; the bar goes back to the usual headline', () => {
    const tab = { tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'Victoria', cwd: null, context: { tokens: 600_000, window: 1_000_000, source: 'catalogue' as const } }] };
    const view = { tab, recap: blankRecap('w1:t1'), notes: new Map(), warnings: [], now: 0, messages: en, compactHint: 40, style: plain };
    assert.match(present(view, 44, () => null).join('\n'), /compact\? 60% of 1M/);
    const shown = present({ ...view, compactions: [base] }, 44, () => null).join('\n');
    assert.ok(shown.includes('◐ compacting… 0:00') && !shown.includes('compact?'), 'they never stand together');
    assert.ok(!presentBar(view, 46).join('').includes('compacting'));
    assert.match(presentBar({ ...view, compactions: [base] }, 46).join(''), /compacting claude/);
});

test('on the bar, the newest compaction of the tab speaks, prefixed with its agent', () => {
    const tab = { tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null, cwd: null }, { pane: 'w1:p2', agent: 'codex', status: 'idle', title: null, cwd: null }] };
    const older = { ...base, startedAt: 1, stage: 'compacted' as const, finishedAt: 5 };
    const newer = { ...base, pane: 'w1:p2', agent: 'codex', startedAt: 9, stageAt: 9000 };
    const lines = presentBar({ tab, recap: blankRecap('w1:t1'), notes: new Map(), warnings: [], now: 12_000, messages: en, compactions: [older, newer], style: plain }, 60);
    assert.match(lines.join(''), /◐ compacting codex… 0:03/);
});

const line = (patch: Partial<CompactionRecord>): string => stageLine({ ...base, ...patch }, 0, { messages: en, style: coloured });
const said = (tokensBefore: number | null, tokensAfter: number | null, tookMs: number | null): object => figuresOf({ tokensBefore, tokensAfter, tookMs }, en);

test('the stage is coloured: yellow while it runs, green when done (the template tag gray), red when it failed, gray otherwise', () => {
    const [yellow, green, red, gray] = ['\u001B[33m', '\u001B[32m', '\u001B[31m', '\u001B[90m'];
    assert.ok(line({}).startsWith(yellow));
    assert.ok(line({ stage: 'compacted', finishedAt: 1, brief: 'template' }).startsWith(green) && line({ stage: 'compacted', finishedAt: 1, brief: 'template' }).includes(`${gray} · template`));
    assert.ok(line({ stage: 'failed', finishedAt: 1 }).startsWith(red));
    assert.ok(line({ stage: 'unconfirmed', finishedAt: 1 }).startsWith(gray) && line({ stage: 'skipped', finishedAt: 1 }).startsWith(gray));
});

test('numbers: the short token form; a pair needs both counts, a missing number is left out, never guessed; the clock is m:ss from the stage start', () => {
    assert.deepEqual([812, 1000, 3057, 39_532, 100_000, 554_888, 1_000_000, 1_250_000].map(tokensOf), ['812', '1k', '3.1k', '39.5k', '100k', '554.9k', '1M', '1.3M']);
    assert.deepEqual(said(39_532, 3057, 15_588), { pair: '39.5k → 3.1k', tokens: '39.5k → 3.1k tokens', took: '16 s' });
    assert.deepEqual(said(39_532, null, null), { pair: '', tokens: '', took: '' });
    assert.deepEqual(said(null, 3057, 59_400), { pair: '', tokens: '', took: '59 s' });
    assert.deepEqual([clockOf(0, 8000), clockOf(0, 12_000), clockOf(1000, 61_000), clockOf(5000, 1000)], ['0:08', '0:12', '1:00', '0:00']);
});
