import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction, RecapRequest, RefusedOperation } from '#src/ports/summarizer.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { severalOf, type Several } from './ledger-input.ts';
import { isoSecond, localTime, type LocalClock } from './local-time.ts';
import { element, leaf, type Attributes } from './xml.ts';

const textOf = brand<string, 'Text'>;

const count = brand<number, 'Count'>;

const NEST = '\n';

export type CorrectionRequest = RecapRequest & { readonly retry: Correction };

type AddedOp = Extract<Operation, { readonly op: 'add' }>;
type UpdatedOp = Extract<Operation, { readonly op: 'update' }>;
type ClosedOp = Extract<Operation, { readonly op: 'close' }>;

function addedOf(op: AddedOp, clock: LocalClock, agents: ReadonlyMap<Text, Text>): Text {
    return textOf(leaf('operation', { op: 'add', section: op.section, at: op.at === null ? null : clock(instant(op.at)), agent: op.agent === null ? null : (agents.get(textOf(op.agent)) ?? null), ref: op.ref === null ? null : textOf(op.ref), why: op.why === null ? null : textOf(op.why), anchor: op.anchor === null || op.anchor === undefined ? null : textOf(op.anchor) }, textOf(op.text)));
}

function updatedOf(op: UpdatedOp): Text {
    return textOf(leaf('operation', { op: 'update', id: textOf(op.id), why: op.why === null ? null : textOf(op.why), anchor: op.anchor === null || op.anchor === undefined ? null : textOf(op.anchor) }, textOf(op.text)));
}

function closedOf(op: ClosedOp): Text {
    return textOf(element('operation', { op: 'close', id: textOf(op.id), closed: op.why }));
}

function operationOf(op: Operation, clock: LocalClock, agents: ReadonlyMap<Text, Text>): Text {
    switch (op.op) {
        case 'add':
            return addedOf(op, clock, agents);
        case 'update':
            return updatedOf(op);
        case 'close':
            return closedOf(op);
        default: {
            const exhaustive: never = op;
            return textOf(String(exhaustive));
        }
    }
}

function refusedOf(refused: RefusedOperation, clock: LocalClock, agents: ReadonlyMap<Text, Text>, several: Several): Text {
    const reasons = refused.reasons.map((each) => `${NEST}  ${leaf('reason', { gate: textOf(each.gate) }, textOf(each.reason))}`).join('');
    return textOf(`${NEST}${element('refused', { task: several ? textOf(refused.task) : null }, textOf(`${NEST}  ${operationOf(refused.operation, clock, agents)}${reasons}${NEST}`))}`);
}

function ledgerOf(facts: readonly InputFact[], clock: LocalClock): Text {
    if (facts.length === 0) {
        return textOf('');
    }
    const lines = facts.map((fact) => {
        const attrs: Attributes = { id: textOf(fact.id), section: fact.section, state: fact.state === 'open' ? null : 'closed', first: clock(instant(fact.first)), last: clock(instant(fact.last)), why: fact.why === null ? null : textOf(fact.why), ref: fact.ref === null ? null : textOf(fact.ref), anchor: fact.anchor === null ? null : textOf(fact.anchor), agent: fact.agent === null ? null : textOf(fact.agent), closed: fact.closed };
        return `${NEST} ${leaf('fact', attrs, textOf(fact.text))}`;
    }).join('');
    return textOf(`${NEST}${element('ledger', {}, textOf(`${lines}${NEST}`))}`);
}

export function correctionDocument(request: CorrectionRequest): Text {
    const { input, retry } = request;
    const clock: LocalClock = (at) => localTime(at, instant(input.tab.now), textOf(input.tab.zone));
    const agents = new Map(input.agents.flatMap((agent) => (agent.label === '' ? [] : [[textOf(agent.label), textOf(agent.id)] as const])));
    const tab = element('tab', { id: textOf(input.tab.id), now: isoSecond(instant(input.tab.now)), zone: textOf(input.tab.zone) });
    const refused = retry.refused.map((each) => refusedOf(each, clock, agents, severalOf(retry.tasks))).join('');
    const problems = retry.problems.map((problem) => `${NEST}${leaf('problem', {}, textOf(problem))}`).join('');
    return textOf(element('correction_input', { version: count(1) }, textOf(`${NEST}${tab}${ledgerOf(retry.facts, clock)}${refused}${problems}${NEST}`)));
}
