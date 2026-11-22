import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction, RecapRequest, RefusedOperation } from '#src/ports/summarizer.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { severalOf, type Several } from './ledger-input.ts';
import { isoSecond, localTime, type LocalClock } from './local-time.ts';
import { element, leaf } from './xml.ts';

const textOf = brand<string, 'Text'>;

const NEST = '\n';

export type CorrectionRequest = RecapRequest & { readonly retry: Correction };

function operationOf(op: Operation, clock: LocalClock, agents: ReadonlyMap<Text, Text>): Text {
    switch (op.op) {
        case 'add':
            return textOf(leaf('operation', { op: 'add', section: op.section, at: op.at === null ? null : clock(instant(op.at)), agent: op.agent === null ? null : (agents.get(textOf(op.agent)) ?? null), ref: op.ref, why: op.why, anchor: op.anchor ?? null }, op.text));
        case 'update':
            return textOf(leaf('operation', { op: 'update', id: op.id, why: op.why, anchor: op.anchor ?? null }, op.text));
        case 'close':
            return textOf(element('operation', { op: 'close', id: op.id, closed: op.why }));
        default: {
            const exhaustive: never = op;
            return textOf(String(exhaustive));
        }
    }
}

function refusedOf(refused: RefusedOperation, clock: LocalClock, agents: ReadonlyMap<Text, Text>, several: Several): Text {
    const reasons = refused.reasons.map((each) => `${NEST}  ${leaf('reason', { gate: each.gate }, each.reason)}`).join('');
    return textOf(`${NEST}${element('refused', { task: several ? refused.task : null }, `${NEST}  ${operationOf(refused.operation, clock, agents)}${reasons}${NEST}`)}`);
}

function ledgerOf(facts: readonly InputFact[], clock: LocalClock): Text {
    if (facts.length === 0) {
        return textOf('');
    }
    const lines = facts.map((fact) => {
        const attrs = { id: fact.id, section: fact.section, state: fact.state === 'open' ? null : 'closed', first: clock(instant(fact.first)), last: clock(instant(fact.last)), why: fact.why, ref: fact.ref, anchor: fact.anchor, agent: fact.agent, closed: fact.closed };
        return `${NEST} ${leaf('fact', attrs, fact.text)}`;
    }).join('');
    return textOf(`${NEST}${element('ledger', {}, `${lines}${NEST}`)}`);
}

export function correctionDocument(request: CorrectionRequest): Text {
    const { input, retry } = request;
    const clock: LocalClock = (at) => localTime(at, instant(input.tab.now), textOf(input.tab.zone));
    const agents = new Map(input.agents.flatMap((agent) => (agent.label === '' ? [] : [[textOf(agent.label), textOf(agent.id)] as const])));
    const tab = element('tab', { id: input.tab.id, now: isoSecond(instant(input.tab.now)), zone: input.tab.zone });
    const refused = retry.refused.map((each) => refusedOf(each, clock, agents, severalOf(retry.tasks))).join('');
    const problems = retry.problems.map((problem) => `${NEST}${leaf('problem', {}, problem)}`).join('');
    return textOf(element('correction_input', { version: 1 }, `${NEST}${tab}${ledgerOf(retry.facts, clock)}${refused}${problems}${NEST}`));
}
