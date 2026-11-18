import { said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';
import { subjectOf } from './legacy.ts';
import type { Outcome } from './legacy.ts';

const GENERIC = ['agent', 'the agent', 'the assistant', 'the model', 'el agente', 'el asistente', 'el modelo', 'the plugin'];
export const narrator: Gate = {
    id: 'G1',
    check: (item, context): Outcome | null => {
        if (item.section === 'links') {
            return null;
        }
        const subject = subjectOf(item.text.trim(), new Set([...context.agents, ...GENERIC]));
        if (subject === null) {
            return null;
        }
        const verb = /^\s+\p{L}/u.test(subject.rest) && !/^\s+code(?![\p{L}\p{N}])/iu.test(subject.rest);
        const labelled = /^\s*[:—-]/u.test(subject.rest) && item.section !== 'now';
        return verb || labelled
            ? { kind: 'refuse', gate: 'G1', reason: said(context.language, 'the subject is an agent: write what happened to the work, not what the agent did', 'el sujeto es un agente: escribe qué pasó con el trabajo, no qué hizo el agente') }
            : null;
    },
};
