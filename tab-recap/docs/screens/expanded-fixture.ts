// The expanded view's screenshot: invented content for the README, drawn by the plugin's own pure view.
import { en } from '#src/i18n/en.ts';
import type { BoundaryBreak } from '#src/ports/boundaries.ts';
import type { Fact, FactId } from '#src/recap/domain/fact.ts';
import type { LaneWebRecord } from '#src/ports/tab-views.ts';
import { sessionFactsFrom } from '#src/recap/domain/session-facts.ts';
import { expanded } from '#src/recap/render/expanded.ts';
import { parseCurating, parseInstant, parseProse, parseTaskName } from '@stateforge-labs/recap-view';
import { viewBreakOf, webOf } from '#src/view-model/column.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { tabIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

const NOW = 1_760_000_000_000;
const MIN = 60_000;
const ago = (minutes: number): number => NOW - minutes * MIN;
const SHOP: LaneWebRecord = { base: textOf('https://git.example/team/shop'), forge: 'gitlab', branch: textOf('feat/payments-v2') };

function fact(id: string, section: Fact['section'], text: string, at: number, more: Partial<Fact> = {}): Fact {
    return { id: id as FactId, task: { tab: tabIdOf('w1:t1'), key: textOf('t1') }, section, text: textOf(text), why: null, ref: null, agent: null, anchor: null, firstAt: instant(at), lastAt: instant(at), state: 'open', closedWhy: null, closedAt: null, language: textOf('en'), ...more };
}

const FACTS: readonly Fact[] = [
    fact('f1', 'goal', 'Move checkout to the v2 payments API, no downtime.', ago(300)),
    fact('f2', 'now', 'Wiring the v2 client behind a feature flag', ago(12), { agent: textOf('claude') }),
    fact('f3', 'needs', 'Should v1 keep accepting gift cards after the cut-over?', ago(95)),
    fact('f4', 'done', '!938 merged: every v1 field mapped to v2', ago(40)),
    fact('f5', 'done', 'Added retries with backoff to the client', ago(150)),
    fact('f6', 'done', 'Mapped the v1 error codes to v2', ago(410)),
    fact('f7', 'decisions', 'Keep the old endpoint until Friday', ago(280), { why: textOf('the mobile app still calls it') }),
    fact('f8', 'decisions', 'Retry three times, not five', ago(200), { why: textOf('the gateway rate-limits after four'), state: 'closed', closedWhy: 'superseded', closedAt: instant(ago(150)) }),
    fact('f9', 'next', 'Canary at 5% of traffic', ago(30)),
    fact('f10', 'next', 'Write the cut-over runbook', ago(260), { state: 'closed', closedWhy: 'wrong', closedAt: instant(ago(100)) }),
    fact('f11', 'rules', 'Never push to main', ago(300)),
    fact('f12', 'links', '`src/payments/v2/client.ts`', ago(60)),
];

const BREAKS: readonly BoundaryBreak[] = [
    { kind: 'compacted', at: instant(ago(180)), trigger: 'manual', tokensBefore: countOf(812_000), tokensAfter: countOf(14_000), took: duration(16_000) },
    { kind: 'switched', at: instant(ago(380)), trigger: null, tokensBefore: null, tokensAfter: null, took: null },
];

/** The lines of the screenshot, at `width` cells. */
export function expandedLines(width: number): readonly string[] {
    return expanded({
        tasks: [{ name: parseTaskName(''), facts: FACTS, story: { text: parseProse('Checkout is moving to the v2 payments API behind a flag. The mapping is merged; the canary waits on one answer about gift cards.'), at: parseInstant(ago(10)) }, curating: parseCurating(false) }],
        session: sessionFactsFrom({
            firstSeen: instant(ago(430)), now: instant(NOW), runs: { 'turn-ended': countOf(31), focused: countOf(4), requested: countOf(2) },
            compactions: [{ tokensBefore: countOf(812_000), tokensAfter: countOf(14_000), origin: 'operator' }],
            lanes: [{ agent: textOf('claude'), label: textOf('Checkout migration'), context: { tokens: countOf(120_000), window: countOf(1_000_000), source: 'catalogue' } }, { agent: textOf('codex'), label: null, context: { tokens: countOf(61_000), window: countOf(258_400), source: 'agent' } }],
            webs: [{ base: SHOP.base, branch: SHOP.branch }], edits: [{ path: textOf('src/payments/v2/client.ts'), count: countOf(9) }, { path: textOf('src/payments/v2/map.ts'), count: countOf(4) }], chapters: countOf(3),
        }),
        width, messages: en, now: NOW, zone: 'UTC', webs: [webOf(SHOP)], breaks: BREAKS.map(viewBreakOf),
    });
}
