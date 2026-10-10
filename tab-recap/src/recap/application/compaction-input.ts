import type { HistoryFact } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { settledBefore } from '#src/recap/domain/boundary.ts';
import { localTime } from './local-time.ts';
import { turnsOf } from './writer-transcript.ts';
import { element, leaf } from './xml.ts';

export const RECENT_BUDGET = 12_000;
const NEST = '\n';

export interface CompactionMaterial {
    readonly agent: { readonly kind: string; readonly label: string; readonly repo: string | null; readonly branch: string | null };
    readonly note: string | null;
    readonly current: RecapSections;
    readonly history: readonly HistoryFact[];
    readonly lastBreakAt: number | null;
    readonly recent: readonly Entry[];
    readonly clock: { readonly now: number; readonly zone: string };
}

const basename = (path: string): string => path.split('/').findLast((part) => part !== '') ?? path;

export function compactionInput(material: CompactionMaterial): string {
    const { agent, clock } = material;
    const at = (ms: number): string => localTime(ms, clock.now, clock.zone);
    const note = (material.note ?? '').trim();
    const items = material.history.map((item) => `\n ${leaf('item', { section: item.section, state: item.state === 'open' ? null : 'closed', first: at(item.firstAt), last: at(item.lastAt), why: item.why, closed: item.closedWhy, settled: settledBefore(item.closedAt, material.lastBreakAt) ? 'yes' : null }, item.text)}`).join('');
    const recent = turnsOf(material.recent, clock, RECENT_BUDGET);
    const body = [
        `${NEST}${element('agent', { kind: agent.kind, label: agent.label, repo: agent.repo === null ? null : basename(agent.repo), branch: agent.branch })}`,
        note === '' ? '' : `${NEST}${leaf('note', {}, note)}`,
        `${NEST}${leaf('current_recap', {}, JSON.stringify(material.current))}`,
        `${NEST}${element('session_history', {}, items === '' ? '' : `${items}\n`)}`,
        `${NEST}${element('recent', recent.attrs, recent.body)}\n`,
    ].join('');
    return element('compaction_input', { version: 2 }, body);
}
