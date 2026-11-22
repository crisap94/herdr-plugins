import type { Count } from '#src/contract/kernel.ts';
import type { InputAgent, RecapInput } from '#src/ports/recap-input.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { correctionDocument } from './correction-input.ts';
import { clipHead } from './writer-clip.ts';
import { localTime, isoSecond, type LocalClock } from './local-time.ts';
import { candidatesOf } from './writer-candidates.ts';
import { transcriptOf } from './writer-transcript.ts';
import type { Clock } from './writer-transcript.ts';
import { element, leaf, type Attributes } from './xml.ts';
import { serializeHidden } from './hidden-codec.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

export const TRANSCRIPT_BUDGET = count(60_000);
const NOTE_CHARS = { 'away_summary': count(400), compaction: count(2_000) } as const;
const LABEL_CHARS = 30;
const NEST = '\n';

const basename = (path: Text): Text => textOf(path.split('/').findLast((part) => part !== '') ?? path);

function agentOf(agent: InputAgent): Text {
    const files = agent.files.map((file) => `\n ${leaf('file', {}, textOf(file))}`).join('');
    const attrs: Attributes = { id: textOf(agent.id), kind: textOf(agent.kind), label: textOf(agent.label.length > LABEL_CHARS ? `${agent.label.slice(0, LABEL_CHARS - 1)}…` : agent.label), pane: textOf(agent.pane), source: agent.source === 'screen' ? 'screen' : null, cwd: agent.cwd === agent.repo || agent.cwd === null ? null : textOf(agent.cwd), repo: agent.repo === null ? null : basename(textOf(agent.repo)), branch: agent.branch === null ? null : textOf(agent.branch) };
    return textOf(`\n${element('agent', attrs, textOf(files === '' ? '' : `${files}\n`))}`);
}

function tasksOf(input: RecapInput): Text {
    const idOf = new Map(input.agents.map((agent) => [agent.pane, agent.id]));
    const tasks = input.tasks.flatMap((task) => {
        const agents = task.lanes.flatMap((pane) => idOf.get(pane) ?? []);
        return agents.length === 0 ? [] : [`\n${element('task', { id: textOf(task.id), name: task.name === '' ? null : textOf(task.name), agents: textOf(agents.join(' ')) })}`];
    });
    return textOf(input.agents.length < 2 || tasks.length === 0 ? '' : `${NEST}${element('current_tasks', {}, textOf(`${tasks.join('')}${NEST}`))}`);
}

const turnClockOf = (input: RecapInput): Clock => ({ now: instant(input.tab.now), zone: textOf(input.tab.zone) });

const clockOf = (input: RecapInput): LocalClock => {
    const { now, zone } = turnClockOf(input);
    return (at) => localTime(at, now, zone);
};

function ledgersOf(input: RecapInput): Text {
    const at = clockOf(input);
    return textOf(input.ledgers.map((ledger) => {
        const hidden = serializeHidden(ledger.hidden ?? new Map());
        const facts = ledger.facts.map((fact) => {
            const attrs: Attributes = { id: textOf(fact.id), section: fact.section, state: fact.state === 'open' ? null : 'closed', first: at(instant(fact.first)), last: at(instant(fact.last)), why: fact.why === null ? null : textOf(fact.why), ref: fact.ref === null ? null : textOf(fact.ref), anchor: fact.anchor === null ? null : textOf(fact.anchor), agent: fact.agent === null ? null : textOf(fact.agent), closed: fact.closed };
            return `\n ${leaf('fact', attrs, textOf(fact.text))}`;
        }).join('');
        return `${NEST}${element('ledger', { task: ledger.task === null ? null : textOf(ledger.task) }, textOf(`${hidden}${facts}${hidden === '' && facts === '' ? '' : '\n'}`))}`;
    }).join(''));
}

function notesOf(input: RecapRequest['input']): Text {
    return textOf(input.notes.map((note) => {
        const kept = clipHead(textOf(note.text), NOTE_CHARS[note.kind]);
        return `${NEST}${leaf('agent_note', { agent: textOf(note.agent), kind: textOf(note.kind), at: note.at === null ? null : localTime(instant(note.at), turnClockOf(input).now, turnClockOf(input).zone), clipped: kept.clipped ? 'tail' : null }, kept.text)}`;
    }).join(''));
}

function transcriptsOf(input: RecapInput, budget: Count): Text {
    const active = input.transcripts.filter((lane) => lane.entries.length > 0);
    const share = count(Math.floor(budget / Math.max(1, active.length)));
    const lanes = active.length > 0 ? active : input.agents.slice(0, 1).map((agent) => ({ agent: agent.id, entries: [] }));
    return textOf(lanes.map((lane) => `${NEST}${transcriptOf(textOf(lane.agent), lane.entries, turnClockOf(input), share)}`).join(''));
}

export function writerContext(request: RecapRequest, budget: Count = TRANSCRIPT_BUDGET): Text {
    if (request.retry !== undefined) {
        return correctionDocument({ ...request, retry: request.retry });
    }
    const { input } = request;
    const tab = element('tab', { id: textOf(input.tab.id), now: isoSecond(instant(input.tab.now)), zone: textOf(input.tab.zone) }, textOf(`${input.agents.map(agentOf).join('')}${NEST}`));
    const correction = request.correction === undefined ? '' : `${NEST}${leaf('correction', {}, textOf(request.correction))}`;
    const body = `${NEST}${tab}${tasksOf(input)}${ledgersOf(input)}${candidatesOf(input)}${notesOf(input)}${transcriptsOf(input, budget)}${correction}\n`;
    return textOf(element('recap_input', { version: count(2) }, textOf(body)));
}
