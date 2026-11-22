import { textOf, type Text } from '../text.ts';
import { said } from './item-gate.ts';
import type { Gate, Outcome } from './item-gate.ts';

export interface Subject {
    readonly rest: Text;
}

const OPENING = /^\W*([\p{L}\p{N}_-]+(?: [\p{L}\p{N}_-]+)?)(.*)$/su;

export function subjectOf(text: Text, known: ReadonlySet<Text>): Subject | null {
    const lowered = text.toLowerCase();
    const named = [...known].filter((name) => lowered.startsWith(name) && !/[\p{L}\p{N}_-]/u.test(lowered.charAt(name.length)));
    const longest = named.reduce<Text | undefined>((best, name) => (best === undefined || name.length > best.length ? name : best), undefined);
    if (longest !== undefined) {
        return { rest: textOf(text.slice(longest.length)) };
    }
    const first = OPENING.exec(text)?.[1]?.toLowerCase();
    return first !== undefined && known.has(textOf(first)) ? { rest: textOf(text.slice(first.length)) } : null;
}

const GENERIC = ['agent', 'the agent', 'the assistant', 'the model', 'el agente', 'el asistente', 'el modelo', 'the plugin'].map(textOf);
export const narrator: Gate = {
    id: 'G1',
    check: (item, context): Outcome | null => {
        if (item.section === 'links') {
            return null;
        }
        const subject = subjectOf(textOf(item.text.trim()), new Set([...context.agents, ...GENERIC]));
        if (subject === null) {
            return null;
        }
        const verb = /^\s+\p{L}/u.test(subject.rest) && !/^\s+code(?![\p{L}\p{N}])/iu.test(subject.rest);
        const labelled = /^\s*[:—-]/u.test(subject.rest) && item.section !== 'now';
        return verb || labelled
            ? { kind: 'refuse', gate: 'G1', reason: said(context.language, textOf('the subject is an agent: write what happened to the work, not what the agent did'), textOf('el sujeto es un agente: escribe qué pasó con el trabajo, no qué hizo el agente')) }
            : null;
    },
};
