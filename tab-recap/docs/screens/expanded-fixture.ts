// The expanded view's screenshot: invented content for the README, drawn by the plugin's own pure view.
import { en } from '#src/i18n/en.ts';
import type { Break } from '#src/ports/boundaries.ts';
import type { Fact, FactId } from '#src/recap/domain/fact.ts';
import { sessionFactsOf } from '#src/recap/domain/session-facts.ts';
import { expanded } from '#src/recap/render/expanded.ts';

const NOW = 1_760_000_000_000;
const MIN = 60_000;
const ago = (minutes: number): number => NOW - minutes * MIN;
const SHOP = { base: 'https://git.example/team/shop', forge: 'gitlab', branch: 'feat/payments-v2' } as const;

function fact(id: string, section: Fact['section'], text: string, at: number, more: Partial<Fact> = {}): Fact {
    return { id: id as FactId, task: { tab: 'w1:t1', key: 't1' }, section, text, why: null, ref: null, agent: null, anchor: null, firstAt: at, lastAt: at, state: 'open', closedWhy: null, closedAt: null, language: 'en', ...more };
}

const FACTS: readonly Fact[] = [
    fact('f1', 'goal', 'Move checkout to the v2 payments API, no downtime.', ago(300)),
    fact('f2', 'now', 'Wiring the v2 client behind a feature flag', ago(12), { agent: 'claude' }),
    fact('f3', 'needs', 'Should v1 keep accepting gift cards after the cut-over?', ago(95)),
    fact('f4', 'done', '!938 merged: every v1 field mapped to v2', ago(40)),
    fact('f5', 'done', 'Added retries with backoff to the client', ago(150)),
    fact('f6', 'done', 'Mapped the v1 error codes to v2', ago(410)),
    fact('f7', 'decisions', 'Keep the old endpoint until Friday', ago(280), { why: 'the mobile app still calls it' }),
    fact('f8', 'decisions', 'Retry three times, not five', ago(200), { why: 'the gateway rate-limits after four', state: 'closed', closedWhy: 'superseded', closedAt: ago(150) }),
    fact('f9', 'next', 'Canary at 5% of traffic', ago(30)),
    fact('f10', 'next', 'Write the cut-over runbook', ago(260), { state: 'closed', closedWhy: 'wrong', closedAt: ago(100) }),
    fact('f11', 'rules', 'Never push to main', ago(300)),
    fact('f12', 'links', '`src/payments/v2/client.ts`', ago(60)),
];

const BREAKS: readonly Break[] = [
    { kind: 'compacted', at: ago(180), trigger: 'manual', tokensBefore: 812_000, tokensAfter: 14_000, tookMs: 16_000 },
    { kind: 'switched', at: ago(380), trigger: null, tokensBefore: null, tokensAfter: null, tookMs: null },
];

/** The lines of the screenshot, at `width` cells. */
export function expandedLines(width: number): readonly string[] {
    return expanded({
        tasks: [{ name: '', facts: FACTS, story: { text: 'Checkout is moving to the v2 payments API behind a flag. The mapping is merged; the canary waits on one answer about gift cards.', at: ago(10) }, curating: false }],
        session: sessionFactsOf({
            firstSeen: ago(430), now: NOW, runs: { 'turn-ended': 31, focused: 4, requested: 2 },
            compactions: [{ tokensBefore: 812_000, tokensAfter: 14_000, origin: 'operator' }],
            lanes: [{ agent: 'claude', label: 'Checkout migration', context: { tokens: 120_000, window: 1_000_000, source: 'catalogue' } }, { agent: 'codex', label: null, context: { tokens: 61_000, window: 258_400, source: 'agent' } }],
            webs: [SHOP], edits: [{ path: 'src/payments/v2/client.ts', count: 9 }, { path: 'src/payments/v2/map.ts', count: 4 }], chapters: 3,
        }),
        width, messages: en, now: NOW, zone: 'UTC', webs: [SHOP], breaks: BREAKS,
    });
}
