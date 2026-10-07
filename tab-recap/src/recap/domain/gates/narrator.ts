// G1 narrator: the item's subject is an agent (its label, its kind, "the agent") followed by a verb — the item is about the narrator, not the work (I5).
import { said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';

/** Always a narrator. The kinds of the tab's own agents (claude, codex, …) come in the context: elsewhere `Hermes` or `Claude` may be what the work is about. */
const GENERIC = ['agent', 'the agent', 'the assistant', 'the model', 'el agente', 'el asistente', 'el modelo', 'the plugin'];
const OPENING = /^\W*([\p{L}\p{N}_-]+(?: [\p{L}\p{N}_-]+)?)(.*)$/su;

/** The words the item opens with that name an agent, and what follows them. */
function subjectOf(text: string, known: ReadonlySet<string>): { readonly rest: string } | null {
    const lowered = text.toLowerCase();
    const named = [...known].filter((name) => lowered.startsWith(name) && !/[\p{L}\p{N}_-]/u.test(lowered.charAt(name.length)));
    const longest = named.toSorted((a, b) => b.length - a.length)[0];
    if (longest !== undefined) {
        return { rest: text.slice(longest.length) };
    }
    const first = OPENING.exec(text)?.[1]?.toLowerCase();
    return first !== undefined && known.has(first) ? { rest: text.slice(first.length) } : null;
}

export const narrator: Gate = {
    id: 'G1',
    check: (item, context) => {
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
