import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction, RecapRequest, RefusedOperation } from '#src/ports/summarizer.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { isoSecond, localTime } from './local-time.ts';
import { element, leaf } from './xml.ts';

const NEST = '\n';

function operationOf(op: Operation, clock: (at: number) => string, agents: ReadonlyMap<string, string>): string {
    switch (op.op) {
        case 'add':
            return leaf('operation', { op: 'add', section: op.section, at: op.at === null ? null : clock(op.at), agent: op.agent === null ? null : (agents.get(op.agent) ?? null), ref: op.ref, why: op.why, anchor: op.anchor ?? null }, op.text);
        case 'update':
            return leaf('operation', { op: 'update', id: op.id, why: op.why, anchor: op.anchor ?? null }, op.text);
        case 'close':
            return element('operation', { op: 'close', id: op.id, closed: op.why });
        default: {
            const exhaustive: never = op;
            return String(exhaustive);
        }
    }
}

function refusedOf(refused: RefusedOperation, clock: (at: number) => string, agents: ReadonlyMap<string, string>, several: boolean): string {
    const reasons = refused.reasons.map((each) => `${NEST}  ${leaf('reason', { gate: each.gate }, each.reason)}`).join('');
    return `${NEST}${element('refused', { task: several ? refused.task : null }, `${NEST}  ${operationOf(refused.operation, clock, agents)}${reasons}${NEST}`)}`;
}

function ledgerOf(facts: readonly InputFact[], clock: (at: number) => string): string {
    if (facts.length === 0) {
        return '';
    }
    const lines = facts.map((fact) => {
        const attrs = { id: fact.id, section: fact.section, state: fact.state === 'open' ? null : 'closed', first: clock(fact.first), last: clock(fact.last), why: fact.why, ref: fact.ref, anchor: fact.anchor, agent: fact.agent, closed: fact.closed };
        return `${NEST} ${leaf('fact', attrs, fact.text)}`;
    }).join('');
    return `${NEST}${element('ledger', {}, `${lines}${NEST}`)}`;
}

export function correctionDocument(request: RecapRequest & { readonly retry: Correction }): string {
    const { input, retry } = request;
    const clock = (at: number): string => localTime(at, input.tab.now, input.tab.zone);
    const agents = new Map(input.agents.flatMap((agent) => (agent.label === '' ? [] : [[agent.label, agent.id] as const])));
    const tab = element('tab', { id: input.tab.id, now: isoSecond(input.tab.now), zone: input.tab.zone });
    const refused = retry.refused.map((each) => refusedOf(each, clock, agents, retry.tasks)).join('');
    const problems = retry.problems.map((problem) => `${NEST}${leaf('problem', {}, problem)}`).join('');
    return element('correction_input', { version: 1 }, `${NEST}${tab}${ledgerOf(retry.facts, clock)}${refused}${problems}${NEST}`);
}
