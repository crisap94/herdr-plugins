import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffContent } from '#src/recap/application/handoff-content.ts';
import { HANDOFF_BUDGET_BYTES, HANDOFF_WORKSITE_BYTES } from '#src/recap/application/handoff-limits.ts';
import { handoffTextOf } from '#src/recap/application/handoff-text.ts';
import type { RenderedBlocks } from '#src/recap/application/handoff-text.ts';
import { taskFactsOf } from '#src/recap/application/ledger-input.ts';
import type { FactId, Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';
import { HANDOFF_GROUP_IDS } from '#src/recap/domain/handoff-content.ts';
import type { HandoffBody, HandoffContent, HandoffEntry, HandoffGroup, HandoffGroupId } from '#src/recap/domain/handoff-content.ts';
import { byteBudgetOf } from '#src/recap/domain/byte-budget.ts';
import type { ByteBudget } from '#src/recap/domain/byte-budget.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { handoffId } from '#src/recap/domain/ids.ts';
import type { WorksiteSnapshot } from '#src/recap/domain/worksite.ts';
import { fitHandoff } from '#src/recap/render/handoff-budget.ts';
import type { FittedHandoff, HandoffFit } from '#src/recap/render/handoff-budget.ts';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import { omittedTotal, serializeHandoff } from '#src/recap/render/handoff-markdown.ts';
import type { OmittedCounts } from '#src/recap/render/handoff-markdown.ts';
import { worksiteTextOf } from '#src/recap/render/worksite.ts';
import { fact } from './fakes/fact-at.ts';

type ShownHandoff = Extract<FittedHandoff, { readonly kind: 'text' }>;

const ID = handoffId('0190f5a4-7c2e-7b1a-9d3f-0123456789ab');
const AT = Date.parse('2026-10-10T12:00:00Z');
const TASK: TaskId = { tab: 'w1:t1', key: 't1' };
const NEVER_CUT: ReadonlySet<HandoffGroupId> = new Set(['goal', 'needs', 'decisions', 'rules']);
const NEWER_POOL: readonly HandoffGroupId[] = ['now', 'next'];
const OLDER_POOL: readonly HandoffGroupId[] = ['done', 'links', 'closed'];
const BIG = byteBudgetOf(10_000_000);
const FRESHNESS: Freshness = { lastRun: { at: AT - 60_000, cause: 'turn-ended' }, status: 'idle', newerPrompts: { kind: 'none' }, refresh: 'not-requested' };
const WORKSITE: WorksiteSnapshot = { kind: 'unavailable' };
const BLOCKS: RenderedBlocks = { reference: { kind: 'handoff', id: ID, at: AT }, freshnessText: freshnessTextOf(FRESHNESS), worksiteText: null };

const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength;

const entryOf = (id: string, text: string, lastAt: number, firstAt = lastAt, reason: string | null = null): HandoffEntry => ({
    id: id as FactId,
    text: sanitizeHandoffText(text),
    firstAt,
    lastAt,
    reason: reason === null ? null : sanitizeHandoffText(reason),
});

const groupOf = (id: HandoffGroupId, entries: readonly HandoffEntry[], capped = 0): HandoffGroup => ({ id, entries, capped });

const fitOf = (groups: readonly HandoffGroup[], more: Partial<HandoffFit> = {}): HandoffFit => ({
    reference: BLOCKS.reference,
    note: null,
    freshnessText: BLOCKS.freshnessText,
    worksiteText: null,
    groups,
    withheld: 0,
    ...more,
});

const shownOf = (result: FittedHandoff): ShownHandoff => (result.kind === 'text' ? result : assert.fail('expected a text, got too-large'));

const textOf = (fit: HandoffFit, budget: ByteBudget = BIG): string => shownOf(fitHandoff(fit, budget)).text;

const bodyOf = (content: HandoffContent): HandoffBody => (content.kind === 'content' ? content : assert.fail(`refused ${content.reason}`));

const renderOf = (content: HandoffContent): FittedHandoff => handoffTextOf(bodyOf(content), BLOCKS);

const contentOf = (open: readonly Fact[], closed: readonly Fact[] = [], note: string | null = null): HandoffContent =>
    buildHandoffContent({ at: AT, task: { open, closed }, freshness: FRESHNESS, worksite: WORKSITE, note });

const omittedLineOf = (text: string): RegExpExecArray | null => /^(\d+) facts omitted \((.*)\)$/m.exec(text);

const filler = (size: number): string => 'x'.repeat(size);

const WORKSITE_BLOCK = worksiteTextOf(
    { kind: 'known', directory: 'w'.repeat(HANDOFF_WORKSITE_BYTES - '## Worksite\n- directory: '.length), repository: null, lastCommit: null, uncommitted: null, edited: [], tokens: [] },
    byteBudgetOf(HANDOFF_WORKSITE_BYTES),
);

const countOf = (fit: HandoffFit, id: HandoffGroupId): number => fit.groups.filter((group) => group.id === id).reduce((sum, group) => sum + group.capped + group.entries.length, 0);

const omittedAll = (fit: HandoffFit): OmittedCounts => ({
    done: countOf(fit, 'done'),
    links: countOf(fit, 'links'),
    closed: countOf(fit, 'closed'),
    now: countOf(fit, 'now'),
    next: countOf(fit, 'next'),
    withheld: fit.withheld,
});

const minimalTextOf = (fit: HandoffFit): string =>
    serializeHandoff({
        reference: fit.reference,
        note: fit.note,
        freshnessText: fit.freshnessText,
        worksiteText: fit.worksiteText,
        groups: fit.groups.filter((group) => NEVER_CUT.has(group.id)),
        omitted: omittedAll(fit),
    });

const prng = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

const randomFit = (random: () => number): HandoffFit => {
    const below = (max: number): number => Math.floor(random() * (max + 1));
    const groups = HANDOFF_GROUP_IDS.map((id) => {
        const size = NEVER_CUT.has(id) ? below(2) : below(id === 'done' || id === 'links' || id === 'closed' ? 10 : 6);
        const entries = Array.from({ length: size }, (_, index) => {
            const key = `${id}${index}`;
            const padding = random() < 0.3 ? '界'.repeat(below(200)) : filler(below(600));
            const lastAt = AT - below(10_000_000);
            const firstAt = lastAt - below(1_000_000);
            const reason = id === 'decisions' && random() < 0.5 ? `because ${index}` : null;
            return entryOf(key, padding === '' ? `[${key}]` : `[${key}] ${padding}`, lastAt, firstAt, reason);
        });
        const capped = id === 'done' || id === 'links' || id === 'closed' ? below(3) : 0;
        return groupOf(id, entries, capped);
    });
    return fitOf(groups, { note: random() < 0.5 ? sanitizeHandoffText('focus on the parser') : null, withheld: below(5) });
};

const survivorsOf = (fit: HandoffFit, text: string, ids: readonly HandoffGroupId[]): readonly HandoffEntry[] =>
    fit.groups.filter((group) => ids.includes(group.id)).flatMap((group) => group.entries).filter((entry) => text.includes(entry.text));

const prunedOf = (fit: HandoffFit, text: string, ids: readonly HandoffGroupId[]): readonly HandoffEntry[] =>
    fit.groups.filter((group) => ids.includes(group.id)).flatMap((group) => group.entries).filter((entry) => !text.includes(entry.text));

const assertNeverCutWhole = (run: number, fit: HandoffFit, text: string): void => {
    for (const group of fit.groups.filter((each) => NEVER_CUT.has(each.id))) {
        for (const entry of group.entries) {
            assert.ok(text.includes(entry.text), `run ${run} never-cut ${entry.id}`);
        }
    }
};

const assertOmittedExact = (run: number, fit: HandoffFit, shown: ShownHandoff): void => {
    const line = omittedLineOf(shown.text);
    assert.equal(line === null ? 0 : Number(line[1]), omittedTotal(shown.omitted), `run ${run} total`);
    for (const id of [...NEWER_POOL, ...OLDER_POOL]) {
        const capped = fit.groups.find((group) => group.id === id)?.capped ?? 0;
        assert.equal((shown.omitted as Partial<Record<HandoffGroupId, number>>)[id], capped + prunedOf(fit, shown.text, [id]).length, `run ${run} ${id}`);
    }
};

const assertPruneOrder = (run: number, fit: HandoffFit, text: string): void => {
    const newerKept = survivorsOf(fit, text, NEWER_POOL);
    const olderKept = survivorsOf(fit, text, OLDER_POOL);
    const newerPruned = prunedOf(fit, text, NEWER_POOL);
    const olderPruned = prunedOf(fit, text, OLDER_POOL);
    if (olderPruned.length > 0) {
        assert.equal(newerKept.length, 0, `run ${run} newer kept while older pruned`);
    }
    for (const dropped of newerPruned) {
        for (const kept of newerKept) {
            assert.ok(dropped.lastAt < kept.lastAt || (dropped.lastAt === kept.lastAt && dropped.id < kept.id), `run ${run} newer order`);
        }
    }
    for (const dropped of olderPruned) {
        for (const kept of olderKept) {
            assert.ok(dropped.lastAt <= kept.lastAt, `run ${run} older order`);
        }
    }
};

const assertFitted = (run: number, fit: HandoffFit, budget: ByteBudget, result: FittedHandoff): void => {
    if (result.kind === 'too-large') {
        assert.ok(bytesOf(minimalTextOf(fit)) > budget, `run ${run} too-large`);
        return;
    }
    assert.ok(bytesOf(result.text) <= budget, `run ${run} budget`);
    assertNeverCutWhole(run, fit, result.text);
    assertOmittedExact(run, fit, result);
    assertPruneOrder(run, fit, result.text);
};

test('the budget is counted in UTF-8 bytes, not in code units', () => {
    const fit = fitOf([groupOf('goal', [entryOf('g1', 'goal', AT)]), groupOf('now', [entryOf('n1', '界'.repeat(200), AT - 1)])]);
    const full = textOf(fit);
    const bytes = bytesOf(full);
    assert.ok(full.length < bytes);
    assert.equal(fitHandoff(fit, byteBudgetOf(bytes)).kind, 'text');
    assert.equal(shownOf(fitHandoff(fit, byteBudgetOf(bytes - 1))).omitted.now, 1);
});

test('the omitted line counts toward the budget, so a text that only fits without it is pruned', () => {
    const fit = fitOf([groupOf('goal', [entryOf('g1', 'goal', AT)]), groupOf('done', [entryOf('d1', 'done one', AT - 1)], 1)]);
    const full = textOf(fit);
    assert.ok(omittedLineOf(full) !== null);
    const pruned = shownOf(fitHandoff(fit, byteBudgetOf(bytesOf(full) - 1)));
    assert.equal(pruned.omitted.done, 2);
    assert.equal(pruned.text.includes('done one'), false);
});

test('the oldest now and next facts go first, one at a time and whole, before any done fact', () => {
    const fit = fitOf([
        groupOf('goal', [entryOf('g1', 'goal', AT)]),
        groupOf('done', [entryOf('d-old', `done old ${filler(400)}`, AT - 500)]),
        groupOf('now', [entryOf('n-old', `now old ${filler(400)}`, AT - 400), entryOf('n-new', 'now new', AT - 10)]),
        groupOf('next', [entryOf('x-1', `next one ${filler(400)}`, AT - 300)]),
    ]);
    const result = shownOf(fitHandoff(fit, byteBudgetOf(bytesOf(textOf(fit)) - 1)));
    assert.equal(result.omitted.now, 1);
    assert.equal(result.omitted.next, 0);
    assert.equal(result.omitted.done, 0);
    assert.ok(result.text.includes('done old'));
    assert.ok(result.text.includes('now new'));
    assert.equal(result.text.includes('now old'), false);
});

test('when no now or next fact is left, the oldest done, links and closed facts go one at a time by last-seen time', () => {
    const fit = fitOf([
        groupOf('goal', [entryOf('g1', 'goal', AT)]),
        groupOf('done', [entryOf('d1', `d1 ${filler(400)}`, AT - 300), entryOf('d2', `d2 ${filler(400)}`, AT - 200)]),
        groupOf('links', [entryOf('l1', `l1 ${filler(400)}`, AT - 100)]),
    ]);
    const first = shownOf(fitHandoff(fit, byteBudgetOf(bytesOf(textOf(fit)) - 1)));
    assert.equal(first.omitted.done, 1);
    assert.equal(first.text.includes('d1 '), false);
    assert.ok(first.text.includes('d2 ') && first.text.includes('l1 '));
    const second = shownOf(fitHandoff(fit, byteBudgetOf(bytesOf(first.text) - 1)));
    assert.equal(second.omitted.done, 2);
    assert.equal(second.text.includes('d2 '), false);
    assert.ok(second.text.includes('l1 '));
});

test('a never-cut part alone over the budget is too-large, with or without droppable facts', () => {
    const big = groupOf('goal', [entryOf('g1', filler(HANDOFF_BUDGET_BYTES), AT)]);
    assert.deepEqual(fitHandoff(fitOf([big]), byteBudgetOf(HANDOFF_BUDGET_BYTES)), { kind: 'too-large' });
    assert.deepEqual(fitHandoff(fitOf([big, groupOf('now', [entryOf('n1', 'now one', AT)])]), byteBudgetOf(HANDOFF_BUDGET_BYTES)), { kind: 'too-large' });
});

test('a never-cut part that fits the budget is rendered whole', () => {
    const text = textOf(fitOf([groupOf('goal', [entryOf('g1', filler(15_000), AT)])]), byteBudgetOf(HANDOFF_BUDGET_BYTES));
    assert.ok(text.includes(filler(15_000)));
});

test('a worksite block of the full 2048 bytes counts toward the budget, so a now fact is dropped to make room for it', () => {
    const groups = [groupOf('goal', [entryOf('g1', 'goal', AT)]), groupOf('now', [entryOf('n1', `now ${filler(300)}`, AT - 1)])];
    assert.equal(bytesOf(WORKSITE_BLOCK), HANDOFF_WORKSITE_BYTES);
    const withoutWorksite = textOf(fitOf(groups));
    const withWorksite = textOf(fitOf(groups, { worksiteText: WORKSITE_BLOCK }));
    const budget = byteBudgetOf(bytesOf(withWorksite) - 1);
    assert.ok(bytesOf(withoutWorksite) <= budget, 'the text without the worksite block fits, so only the block makes it too big');
    const result = shownOf(fitHandoff(fitOf(groups, { worksiteText: WORKSITE_BLOCK }), budget));
    assert.equal(result.omitted.now, 1);
    assert.equal(result.text.includes(filler(300)), false);
    assert.ok(result.text.endsWith(WORKSITE_BLOCK));
    assert.ok(bytesOf(result.text) <= budget);
});

test('never-cut parts plus a full worksite block that do not fit give too-large, with a now fact to drop', () => {
    const groups = [groupOf('goal', [entryOf('g1', 'goal', AT)]), groupOf('now', [entryOf('n1', 'now one', AT - 1)])];
    const goalOnly = textOf(fitOf([groupOf('goal', [entryOf('g1', 'goal', AT)])]));
    const budget = byteBudgetOf(bytesOf(goalOnly) + HANDOFF_WORKSITE_BYTES - 1);
    assert.ok(bytesOf(goalOnly) <= budget);
    assert.deepEqual(fitHandoff(fitOf(groups, { worksiteText: WORKSITE_BLOCK }), budget), { kind: 'too-large' });
});

test('nothing omitted means no omitted line', () => {
    assert.equal(omittedLineOf(textOf(fitOf([groupOf('goal', [entryOf('g1', 'goal', AT)])]))), null);
});

test('a withheld count alone is an omitted line that names only the counts', () => {
    const text = textOf(fitOf([groupOf('goal', [entryOf('g1', 'goal', AT)])], { withheld: 3 }));
    assert.ok(text.includes('\n\n3 facts omitted (done 0, links 0, closed 0, now 0, next 0, withheld 3)'));
});

test('a long-lived lane shows 15 of each capped group, newest by last-seen time, and its omitted line names each count', () => {
    const open = [
        fact('g1', 'goal', 'the goal', AT - 1_000),
        ...Array.from({ length: 60 }, (_, index) => fact(`d${index}`, 'done', `done ${index}`, AT - (60 - index) * 1_000)),
        ...Array.from({ length: 40 }, (_, index) => fact(`l${index}`, 'links', `link ${index}`, AT - (40 - index) * 1_000)),
    ];
    const closed = Array.from({ length: 90 }, (_, index): Fact => ({ ...fact(`c${index}`, 'next', `closed ${index}`, AT - 60_000 * (index + 1)), state: 'closed', closedWhy: 'superseded', closedAt: AT - 60_000 * (index + 1) }));
    const result = shownOf(renderOf(contentOf(open, closed)));
    assert.equal(result.text.match(/^- .* done \d+$/gm)?.length, 15);
    assert.equal(result.text.match(/^- .* link \d+$/gm)?.length, 15);
    assert.equal(result.text.match(/^- .* closed \d+$/gm)?.length, 15);
    assert.equal(result.text.includes('done 44'), false);
    assert.ok(result.text.includes('- 2026-10-10 11:59Z done 59'));
    assert.ok(result.text.includes('\n\n145 facts omitted (done 45, links 25, closed 75, now 0, next 0, withheld 0)'));
});

test('the shown facts are selected by last-seen time and rendered by first-seen time', () => {
    const open = [
        fact('g1', 'goal', 'the goal', AT),
        ...Array.from({ length: 16 }, (_, index) => fact(`d${index}`, 'done', `done ${index}`, AT - index * 1_000, { firstAt: AT - 100_000 - index * 1_000 })),
    ];
    const result = shownOf(renderOf(contentOf(open)));
    const shown = result.text.match(/^- .* done \d+$/gm)?.map((line) => line.slice(line.lastIndexOf(' ') + 1)) ?? [];
    assert.deepEqual(shown, Array.from({ length: 15 }, (_, index) => String(14 - index)));
});

test('the handoff text is identical for identical inputs and changes only its reference line for a different HandoffId', () => {
    const content = contentOf([fact('g1', 'goal', 'the goal', AT - 1_000)], [], 'a note');
    const first = renderOf(content);
    assert.deepEqual(first, renderOf(content));
    const other = handoffTextOf(bodyOf(content), { ...BLOCKS, reference: { kind: 'handoff', id: handoffId('0190f5a4-7c2e-7b1a-9d3f-0123456789ac'), at: AT } });
    const firstLines = shownOf(first).text.split('\n');
    const otherLines = shownOf(other).text.split('\n');
    assert.deepEqual(firstLines.flatMap((line, index) => (line === otherLines[index] ? [] : [index])), [2]);
});

test('a fact and a note with format characters, bidi overrides, tag characters and separators render the text of the same fact without them', () => {
    const withCharacters = contentOf([fact('g1', 'goal', 'the goal', AT - 2_000), fact('n1', 'now', 'the\u{200B}\u{2028} la\u{202D}ne\u0085 done\u{E0041}', AT - 1_000)], [], 'focus\u{202E} here');
    const without = contentOf([fact('g1', 'goal', 'the goal', AT - 2_000), fact('n1', 'now', 'the lane done', AT - 1_000)], [], 'focus here');
    const text = shownOf(renderOf(without)).text;
    assert.ok(text.endsWith('- 2026-10-10 11:59Z the lane done'));
    assert.equal(shownOf(renderOf(withCharacters)).text, text);
});

test('a task whose pane has session history renders none of it, only the ledger facts', () => {
    const ledger = {
        openOf: (): readonly Fact[] => [fact('g1', 'goal', 'the ledger goal', AT - 1_000)],
        recentlyClosed: (): readonly Fact[] => [],
        historyOf: (): string => 'SESSION-HISTORY-SENTINEL',
    };
    const result = renderOf(contentOf(taskFactsOf(ledger, TASK, AT).open, taskFactsOf(ledger, TASK, AT).closed));
    const text = shownOf(result).text;
    assert.equal(text.includes('SESSION-HISTORY-SENTINEL'), false);
    assert.equal(text.includes('the ledger goal'), true);
});

test('the budget number is HANDOFF_BUDGET_BYTES: a body of 17000 bytes is too-large', () => {
    assert.deepEqual(renderOf(contentOf([fact('g1', 'goal', filler(17_000), AT - 1_000)])), { kind: 'too-large' });
});

test('any budget terminates: the text fits with every never-cut part whole and an exact omitted line, or the result is too-large', () => {
    const random = prng(20261011);
    for (let run = 0; run < 400; run += 1) {
        const fit = randomFit(random);
        const budget = byteBudgetOf(1 + Math.floor(random() * 20_000));
        assertFitted(run, fit, budget, fitHandoff(fit, budget));
    }
});

test('a sweep of budgets never returns a text over its budget', () => {
    const fit = fitOf([
        groupOf('goal', [entryOf('g1', `[g1] ${filler(120)}`, AT)]),
        groupOf('done', [entryOf('d1', `[d1] ${filler(300)}`, AT - 3), entryOf('d2', `[d2] ${filler(300)}`, AT - 2)], 2),
        groupOf('now', [entryOf('n1', `[n1] ${filler(300)}`, AT - 1)]),
    ]);
    const full = bytesOf(textOf(fit));
    for (let budget = 1; budget <= full + 5; budget += 7) {
        const result = fitHandoff(fit, byteBudgetOf(budget));
        if (result.kind === 'text') {
            assert.ok(bytesOf(result.text) <= budget, `budget ${budget}`);
        }
    }
});
