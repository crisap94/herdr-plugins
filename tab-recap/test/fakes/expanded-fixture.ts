// A small, fixed expanded view: one task, a waiting question, a decision with its why, a closed fact, a day change.
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { sessionFactsOf } from '#src/recap/domain/session-facts.ts';
import type { ExpandedView } from '#src/recap/render/expanded.ts';
import { plain } from '#src/recap/render/wrap.ts';
import { fact } from './fact-at.ts';

export const NOW = Date.parse('2026-10-07T16:30:00Z');
const at = (clock: string, day = '2026-10-07'): number => Date.parse(`${day}T${clock}:00Z`);
const MIN = 60_000;

export const FACTS = [
    fact('f1', 'goal', 'Ship the expanded view in tab-recap 2.0', at('09:12')),
    fact('f2', 'now', 'Writing the timeline renderer', at('16:20'), { agent: 'host' }),
    fact('f3', 'needs', 'Which effort should the curator default to: low or medium?', NOW - 25 * MIN),
    fact('f4', 'needs', 'Approve the migration number 007 for the story columns', NOW - 3 * 60 * MIN),
    fact('f5', 'done', 'Merged !34 adding the compaction records', at('14:02')),
    fact('f6', 'done', 'Fixed the context share in src/recap/render/present.ts', at('17:10', '2026-10-06'), {}),
    fact('f7', 'next', 'Add a retention sweep to this change', at('10:00'), { state: 'closed', closedWhy: 'wrong', closedAt: at('14:02') }),
    fact('f8', 'next', 'Draw the expanded view from the ledger', at('16:00')),
    fact('f9', 'decisions', 'Keep the guard out of sibling modules', at('11:30'), { why: 'an import guard cannot stop sibling modules' }),
    fact('f10', 'rules', 'Never touch the live checkout', at('09:20')),
    fact('f11', 'links', 'compaction records !34', at('14:03')),
];

export function sampleView(width: number, locale: 'en' | 'es' = 'en', over: Partial<ExpandedView> = {}): ExpandedView {
    return {
        tasks: [{ name: '', facts: FACTS, story: { text: 'The 2.0 engine is being built in four changes; the expanded view is drawn from the ledger and waits on one answer.', at: at('16:10') }, curating: false }],
        session: sessionFactsOf({
            firstSeen: at('09:12'), now: NOW, runs: { 'turn-ended': 36, focused: 3, requested: 2 },
            compactions: [{ tokensBefore: 800_000, tokensAfter: 14_000 }, { tokensBefore: 39_000, tokensAfter: 3_000 }],
            lanes: [{ agent: 'claude', label: 'orchestrator', context: { tokens: 340_000, window: 1_000_000, source: 'table' } }, { agent: 'codex', label: 'host', context: { tokens: 32_640, window: 272_000, source: 'agent' } }],
            webs: [{ base: 'https://git.example/group/herdr-plugins', branch: 'feat/expanded' }],
            edits: [{ path: 'src/recap/application/compaction.ts', count: 7 }, { path: 'src/recap/render/present.ts', count: 5 }],
        }),
        width, messages: locale === 'en' ? en : es, style: plain, now: NOW, zone: 'UTC', webs: [], ...over,
    };
}
