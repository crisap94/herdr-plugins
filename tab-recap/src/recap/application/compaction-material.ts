import type { HistoryFact } from '@stateforge-labs/session-ledger';
import type { Entry } from '@stateforge-labs/session-ledger';
import type { RecapSections } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import { settledBefore } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import { localTime } from '@stateforge-labs/session-ledger';
import { turnsOf } from '@stateforge-labs/session-ledger';
import { element, leaf } from '@stateforge-labs/session-ledger';

export const RECENT_BUDGET = must(parseCount(12_000));
const NEST = '\n';

export interface MaterialAgent {
    readonly kind: Text;
    readonly label: Text;
    readonly repo: Text | null;
    readonly branch: Text | null;
}

export interface MaterialClock {
    readonly now: Instant;
    readonly zone: Text;
}

export interface CompactionMaterial {
    readonly agent: MaterialAgent;
    readonly note: Text | null;
    readonly current: RecapSections;
    readonly history: readonly HistoryFact[];
    readonly lastBreakAt: Instant | null;
    readonly recent: readonly Entry[];
    readonly clock: MaterialClock;
}

const basename = (path: Text): Text => {
    const part = path.split('/').findLast((piece) => piece !== '') ?? path;
    return must(parseText(part));
};

export function compactionMaterialInput(material: CompactionMaterial): Text {
    const { agent, clock } = material;
    const at = (ms: Instant): Text => must(parseText(localTime(ms, clock.now, clock.zone)));
    const note = (material.note ?? '').trim();
    const items = material.history.map((item) => `\n ${leaf('item', { section: must(parseText(item.section)), state: item.state === 'open' ? null : 'closed', first: at(instant(item.firstAt)), last: at(instant(item.lastAt)), why: item.why === null ? null : must(parseText(item.why)), closed: item.closedWhy === null ? null : must(parseText(item.closedWhy)), settled: settledBefore(item.closedAt, material.lastBreakAt) ? 'yes' : null }, must(parseText(item.text)))}`).join('');
    const recent = turnsOf(material.recent, clock, RECENT_BUDGET);
    const repo = agent.repo === null ? null : basename(agent.repo);
    const body = [
        `${NEST}${element('agent', { kind: must(parseText(agent.kind)), label: must(parseText(agent.label)), repo, branch: agent.branch === null ? null : must(parseText(agent.branch)) })}`,
        note === '' ? '' : `${NEST}${leaf('note', {}, must(parseText(note)))}`,
        `${NEST}${leaf('current_recap', {}, must(parseText(JSON.stringify(material.current))))}`,
        `${NEST}${element('session_history', {}, must(parseText(items === '' ? '' : `${items}\n`)))}`,
        `${NEST}${element('recent', recent.attrs, recent.body)}\n`,
    ].join('');
    return must(parseText(element('compaction_input', { version: must(parseCount(2)) }, must(parseText(body)))));
}
