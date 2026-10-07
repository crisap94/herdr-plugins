// The brief writer's input: one `compaction_input` document (schema/compaction-input.dtd), data only. The instructions come separately.
import type { HistoryItem } from '#src/ports/recap-records.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { localTime } from './local-time.ts';
import { turnsOf } from './writer-transcript.ts';
import { element, leaf } from './xml.ts';

/** Characters of the agent's last turns. */
export const RECENT_BUDGET = 12_000;
const NEST = '\n';

export interface CompactionMaterial {
    readonly agent: { readonly kind: string; readonly label: string; readonly repo: string | null; readonly branch: string | null };
    /** the operator's note, as typed; null or blank: none */
    readonly note: string | null;
    readonly current: RecapSections;
    readonly history: readonly HistoryItem[];
    readonly recent: readonly Entry[];
    readonly clock: { readonly now: number; readonly zone: string };
}

const basename = (path: string): string => path.split('/').findLast((part) => part !== '') ?? path;

/** The document for `material`; the history comes newest first, as the repository hands it. */
export function compactionInput(material: CompactionMaterial): string {
    const { agent, clock } = material;
    const at = (ms: number): string => localTime(ms, clock.now, clock.zone);
    const note = (material.note ?? '').trim();
    const items = material.history.map((item) => `\n ${leaf('item', { section: item.section, first: at(item.firstAt), last: at(item.lastAt), seen: item.seen }, item.text)}`).join('');
    const recent = turnsOf(material.recent, clock, RECENT_BUDGET);
    const body = [
        `${NEST}${element('agent', { kind: agent.kind, label: agent.label, repo: agent.repo === null ? null : basename(agent.repo), branch: agent.branch })}`,
        note === '' ? '' : `${NEST}${leaf('note', {}, note)}`,
        `${NEST}${leaf('current_recap', {}, JSON.stringify(material.current))}`,
        `${NEST}${element('session_history', {}, items === '' ? '' : `${items}\n`)}`,
        `${NEST}${element('recent', recent.attrs, recent.body)}\n`,
    ].join('');
    return element('compaction_input', { version: 1 }, body);
}
