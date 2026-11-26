import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { visibleLength } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { instant, textOf } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { withWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { closeFact, golden, MIN, recordBreaks, recordCompactions, recordFacts, recordSwitch, showRecap, showTab, VERSION, type FactSeed } from '../support/view-seeds.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOW = Date.parse('2026-10-07T16:30:00Z');
const at = (clock: string, day = '2026-10-07'): number => Date.parse(`${day}T${clock}:00Z`);

const FACTS: readonly FactSeed[] = [
    { section: 'goal', text: 'Ship the expanded view in tab-recap 2.0', at: at('09:12') },
    { section: 'now', text: 'Writing the timeline renderer', at: at('16:20') },
    { section: 'needs', text: 'Which effort should the curator default to: low or medium?', at: NOW - 25 * MIN },
    { section: 'needs', text: 'Approve the migration number 007 for the story columns', at: NOW - 180 * MIN },
    { section: 'done', text: 'Merged !34 adding the compaction records', at: at('14:02') },
    { section: 'done', text: 'Fixed the context share in src/recap/render/present.ts', at: at('17:10', '2026-10-06') },
    { section: 'next', text: 'Add a retention sweep to this change', at: at('10:00') },
    { section: 'next', text: 'Draw the expanded view from the ledger', at: at('16:00') },
    { section: 'decisions', text: 'Keep the guard out of sibling modules', at: at('11:30'), why: 'an import guard cannot stop sibling modules' },
    { section: 'rules', text: 'Never touch the live checkout', at: at('09:20') },
    { section: 'links', text: 'compaction records !34', at: at('14:03') },
];

const BREAKS = [
    { at: at('12:00'), before: 39_000, after: 3000, took: null, trigger: 'auto' },
    { at: at('15:20'), before: 800_000, after: 14_000, took: 15_588, trigger: 'manual' },
] as const;

const inWorld = <T>(use: (world: ViewWorld) => Promise<T>): Promise<T> => withWorld({ now: NOW, version: VERSION }, use);

const filled = (lines: readonly string[]): number => lines.slice(0, -1).filter((line) => line.trim() !== '').length;

const joined = (pane: Pane): string => (pane.screen()?.plain ?? []).join(' ').replaceAll(/\s+/gu, ' ');

const STORY = 'The 2.0 engine is being built in four changes; the expanded view is drawn from the ledger and waits on one answer.';

interface Step {
    readonly at: number;
    readonly run: () => void;
}

function seedSession(world: ViewWorld, withBreaks: boolean, withLog = true): void {
    showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator' }], { at: NOW });
    showRecap(world, { at: at('08:00') });
    const steps: Step[] = FACTS.map((fact) => ({ at: fact.at, run: () => { recordFacts(world, fact.at, [fact]); } }));
    steps.push({ at: at('14:02') + 1, run: () => { closeFact(world, 'Add a retention sweep to this change', 'wrong', at('14:02') + 1); } });
    if (withBreaks) {
        steps.push({ at: at('18:00', '2026-10-06'), run: () => { recordSwitch(world, at('18:00', '2026-10-06')); } });
        steps.push({ at: at('15:30'), run: () => { recordBreaks(world, at('15:30'), BREAKS); if (withLog) { recordCompactions(world, [{ at: at('12:00') - 3 * 60 * MIN, before: 39_000, after: 3000, origin: 'auto' }, { at: at('15:20') - 3 * 60 * MIN, before: 800_000, after: 14_000, origin: 'operator' }]); } } });
    }
    for (const step of steps.toSorted((left, right) => left.at - right.at)) {
        step.run();
    }
    world.store.stories.keep({ task: { scope: tabId('w1:t1'), key: textOf('t1') }, at: instant(NOW), language: textOf('en') }, { story: textOf(STORY), merges: [] });
}

async function modal<T>(world: ViewWorld, cols: number, use: (pane: Pane) => Promise<T>, marker = 'TIMELINE'): Promise<T> {
    const pane = await world.pane({ cols, rows: 140, role: 'modal' });
    try {
        await pane.painted((screen) => screen.text.includes(marker), 'the expanded view paints');
        return await use(pane);
    } finally {
        await pane.close();
    }
}

for (const locale of ['en', 'es'] as const) {
    for (const width of [80, 140]) {
        const cols = width + 2;
        test(`the expanded view of a session that broke, at ${width} cells in ${locale}, equals its golden`, { timeout: 30_000 }, async () => {
            await inWorld(async (world) => {
                world.setLocale(locale);
                seedSession(world, true);
                await modal(world, cols, async (pane) => {
                    const screen = pane.screen();
                    assert.ok(screen !== null);
                    assert.ok(screen.plain.every((line) => visibleLength(line) <= cols - 1), `a row is wider than ${width} cells`);
                    golden(join(FIXTURES, `expanded-breaks-${locale}-${width}.txt`), screen.plain);
                }, locale === 'en' ? 'TIMELINE' : 'CRONOLOGÍA');
            });
        });
    }
}

test('below 140 cells the view is one column; from 140 it is two columns with a gutter', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seedSession(world, false);
        const narrow = await modal(world, 82, async (pane) => pane.screen()?.plain ?? []);
        const wide = await modal(world, 142, async (pane) => pane.screen()?.plain ?? []);
        assert.ok(Math.max(...narrow.map((line) => visibleLength(line))) <= 81);
        assert.ok(Math.max(...wide.map((line) => visibleLength(line))) > 100, 'the wide view uses both columns');
        assert.ok(filled(wide) < filled(narrow), 'two columns hold the same content in fewer rows');
    });
});

test('the timeline is newest first, a day change gets a date line, and a closed fact is marked closed', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seedSession(world, false);
        await modal(world, 82, async (pane) => {
            const lines = pane.screen()?.plain ?? [];
            const timeline = lines.slice(lines.indexOf('TIMELINE'));
            const where = (needle: string): number => timeline.findIndex((line) => line.includes(needle));
            assert.ok(where('14:02 Merged !34 adding the compaction records') > 0);
            assert.ok(where('14:02 Merged !34') < where('17:10 Fixed the context share'), 'newest first');
            assert.ok(where('14:02 Merged !34') < where('2026-10-06'), 'the date line comes after the newer day');
            assert.ok(where('2026-10-06') < where('17:10 Fixed the context share'), 'and before the facts of that day');
            assert.ok(timeline.some((line) => line.includes('14:02 Add a retention sweep to this change · closed: wrong')));
        });
    });
});

test('each break is a line between the facts around it, in time order', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seedSession(world, true);
        await modal(world, 82, async (pane) => {
            const lines = pane.screen()?.plain ?? [];
            const where = (needle: string): number => lines.findIndex((line) => line.includes(needle));
            const [manual, auto] = [where('── compacted 800k → 14k · 16 s'), where('── compacted 39k → 3k')];
            assert.ok(manual > 0 && auto > manual, 'newest first');
            assert.ok(manual < where('14:02 Add a retention sweep') && where('14:02 Merged !34') < auto, 'the 15:20 break is above the 14:0x facts, the 12:00 one below them');
            const [date, fresh, fact] = [where('2026-10-06'), where('── new session'), where('17:10 Fixed the context share')];
            assert.ok(auto < date && date < fresh && fresh < fact, 'the day line comes first, then the new session, then the fact of that day');
        });
    });
});

test('a view with no breaks draws no break line, and one chapter says nothing about chapters', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seedSession(world, false);
        await modal(world, 82, async (pane) => {
            const text = pane.screen()?.text ?? '';
            assert.doesNotMatch(text, /── /);
            assert.doesNotMatch(text, /chapters/);
        });
    });
});

test('the session facts count the chapters on the compactions line, in both languages', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seedSession(world, true);
        await modal(world, 202, async (pane) => {
            assert.match(joined(pane), /compactions 2 \(1 by you · 1 auto\) \(39k → 3k · 800k → 14k\) · chapters 4/);
        });
        world.setLocale('es');
        await modal(world, 202, async (pane) => {
            assert.match(joined(pane), /compactaciones 2 \(1 por ti · 1 auto\) \(39k → 3k · 800k → 14k\) · capítulos 4/);
        }, 'CRONOLOGÍA');
    });
});

test('with no compaction on record the chapter count stands alone; a chapter count of one says nothing', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seedSession(world, true, false);
        await modal(world, 82, async (pane) => {
            const lines = pane.screen()?.plain ?? [];
            assert.ok(lines.includes('chapters 4'), 'the count is a line of its own');
            assert.ok(lines.every((line) => !line.includes('compactions')));
        });
    });
    await inWorld(async (world) => {
        seedSession(world, false);
        await modal(world, 82, async (pane) => {
            assert.ok((pane.screen()?.plain ?? []).every((line) => !line.includes('chapters')), 'one chapter is not worth a word');
        });
    });
});

test('the Decisions region hides a rewritten close and a "(not recorded)" why, shows one closed for a real reason; the timeline keeps every closed fact', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator' }], { at: NOW });
        showRecap(world, { at: at('09:00') });
        recordFacts(world, at('09:00'), [
            { section: 'decisions', text: 'Retry three times, not five', at: at('10:00'), why: 'the gateway rate-limits after four' },
            { section: 'decisions', text: 'Use the old cart endpoint', at: at('09:00'), why: '(not recorded)' },
            { section: 'decisions', text: 'Keep SQLite', at: at('09:10'), why: '(not recorded)' },
        ]);
        closeFact(world, 'Use the old cart endpoint', 'rewritten', at('09:30'));
        closeFact(world, 'Retry three times, not five', 'superseded', at('11:00'));
        await modal(world, 82, async (pane) => {
            const lines = pane.screen()?.plain ?? [];
            const decisions = lines.slice(lines.indexOf('DECISIONS'), lines.indexOf('TIMELINE')).join('\n');
            assert.ok(decisions.includes('Retry three times, not five · closed: superseded') && decisions.includes('the gateway rate-limits after four'));
            assert.ok(!decisions.includes('old cart endpoint'), 'rewritten stays out of Decisions');
            assert.ok(decisions.includes('Keep SQLite') && !decisions.includes('(not recorded)'), 'an open decision is shown, its placeholder why is not');
            assert.ok(lines.join('\n').includes('09:30 Use the old cart endpoint · closed: rewritten'), 'the timeline keeps it');
            golden(join(FIXTURES, 'expanded-decisions-en-80.txt'), lines);
        });
    });
});
