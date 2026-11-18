import type { InputAgent, RecapInput } from '#src/ports/recap-input.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { correctionDocument } from './correction-input.ts';
import { clipHead } from './writer-clip.ts';
import { localTime, isoSecond } from './local-time.ts';
import { candidatesOf } from './writer-candidates.ts';
import { transcriptOf } from './writer-transcript.ts';
import { element, leaf } from './xml.ts';
import { serializeHidden } from './hidden-codec.ts';

export const TRANSCRIPT_BUDGET = 60_000;
const NOTE_CHARS = { 'away_summary': 400, compaction: 2_000 } as const;
const LABEL_CHARS = 30;
const NEST = '\n';

const basename = (path: string): string => path.split('/').findLast((part) => part !== '') ?? path;

function agentOf(agent: InputAgent): string {
    const files = agent.files.map((file) => `\n ${leaf('file', {}, file)}`).join('');
    const attrs = { id: agent.id, kind: agent.kind, label: agent.label.length > LABEL_CHARS ? `${agent.label.slice(0, LABEL_CHARS - 1)}…` : agent.label, pane: agent.pane, source: agent.source === 'screen' ? 'screen' : null, cwd: agent.cwd === agent.repo ? null : agent.cwd, repo: agent.repo === null ? null : basename(agent.repo), branch: agent.branch };
    return `\n${element('agent', attrs, files === '' ? '' : `${files}\n`)}`;
}

function tasksOf(input: RecapInput): string {
    const idOf = new Map(input.agents.map((agent) => [agent.pane, agent.id]));
    const tasks = input.tasks.flatMap((task) => {
        const agents = task.lanes.flatMap((pane) => idOf.get(pane) ?? []);
        return agents.length === 0 ? [] : [`\n${element('task', { id: task.id, name: task.name === '' ? null : task.name, agents: agents.join(' ') })}`];
    });
    return input.agents.length < 2 || tasks.length === 0 ? '' : `${NEST}${element('current_tasks', {}, `${tasks.join('')}${NEST}`)}`;
}

const clockOf = (input: RecapInput): ((at: number) => string) => (at) => localTime(at, input.tab.now, input.tab.zone);

function ledgersOf(input: RecapInput): string {
    const at = clockOf(input);
    return input.ledgers.map((ledger) => {
        const hidden = serializeHidden(ledger.hidden ?? new Map());
        const facts = ledger.facts.map((fact) => {
            const attrs = { id: fact.id, section: fact.section, state: fact.state === 'open' ? null : 'closed', first: at(fact.first), last: at(fact.last), why: fact.why, ref: fact.ref, anchor: fact.anchor, agent: fact.agent, closed: fact.closed };
            return `\n ${leaf('fact', attrs, fact.text)}`;
        }).join('');
        return `${NEST}${element('ledger', { task: ledger.task }, `${hidden}${facts}${hidden === '' && facts === '' ? '' : '\n'}`)}`;
    }).join('');
}

function notesOf(input: RecapRequest['input']): string {
    return input.notes.map((note) => {
        const kept = clipHead(note.text, NOTE_CHARS[note.kind]);
        return `${NEST}${leaf('agent_note', { agent: note.agent, kind: note.kind, at: note.at === null ? null : localTime(note.at, input.tab.now, input.tab.zone), clipped: kept.clipped ? 'tail' : null }, kept.text)}`;
    }).join('');
}

function transcriptsOf(input: RecapInput, budget: number): string {
    const active = input.transcripts.filter((lane) => lane.entries.length > 0);
    const share = Math.floor(budget / Math.max(1, active.length));
    const lanes = active.length > 0 ? active : input.agents.slice(0, 1).map((agent) => ({ agent: agent.id, entries: [] }));
    return lanes.map((lane) => `${NEST}${transcriptOf(lane.agent, lane.entries, input.tab, share)}`).join('');
}

export function writerContext(request: RecapRequest, budget = TRANSCRIPT_BUDGET): string {
    if (request.retry !== undefined) {
        return correctionDocument({ ...request, retry: request.retry });
    }
    const { input } = request;
    const tab = element('tab', { id: input.tab.id, now: isoSecond(input.tab.now), zone: input.tab.zone }, `${input.agents.map(agentOf).join('')}${NEST}`);
    const correction = request.correction === undefined ? '' : `${NEST}${leaf('correction', {}, request.correction)}`;
    const body = `${NEST}${tab}${tasksOf(input)}${ledgersOf(input)}${candidatesOf(input)}${notesOf(input)}${transcriptsOf(input, budget)}${correction}\n`;
    return element('recap_input', { version: 2 }, body);
}
