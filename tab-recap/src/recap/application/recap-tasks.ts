// What the writer answers for a tab with several lanes: tasks (each with the seven sections), or, for
// one task, the seven sections themselves. Pure and tolerant: a tab never loses its recap to a muddled grouping.
import { objectIn, sectionsFrom } from './recap-shape.ts';
import type { Proposal, Proposed } from '#src/recap/domain/tasks.ts';

export type ParsedProposal = { readonly kind: 'proposal'; readonly proposal: Proposal } | { readonly kind: 'invalid'; readonly why: string };

const NAME_WORDS = 6;

const fieldsOf = (value: unknown): Readonly<Record<string, unknown>> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;

/** A reference to a lane is its pane id, maybe inside a label (`claude in w1:p2 — title`). */
function panesIn(value: unknown, panes: readonly string[]): readonly string[] {
    const refs = Array.isArray(value) ? value : [value];
    return refs.flatMap((ref: unknown) => {
        const tokens = typeof ref === 'string' ? ref.split(/[\s,;—]+/) : [];
        return panes.filter((pane) => tokens.includes(pane));
    });
}

function nameOf(value: unknown): string {
    const words = typeof value === 'string' ? value.replaceAll('**', '').replace(/\s+/g, ' ').trim().split(' ').filter((word) => word !== '') : [];
    return words.slice(0, NAME_WORDS).join(' ');
}

function taskOf(value: unknown, panes: readonly string[]): Proposed | null {
    const fields = fieldsOf(value);
    const sections = fields === null ? null : sectionsFrom(fields);
    return fields === null || sections === null ? null : { name: nameOf(fields['name']), lanes: panesIn(fields['lanes'], panes), sections };
}

/**
 * Check the writer's answer for the lanes `panes`. `tasks` that are missing or all unusable fall back to ONE task
 * from the top-level sections; an answer with neither is invalid (the job asks once more).
 */
export function parseProposal(text: string, panes: readonly string[]): ParsedProposal {
    let found: unknown;
    try {
        found = objectIn(text);
    } catch {
        return { kind: 'invalid', why: 'the answer is not valid JSON' };
    }
    const fields = fieldsOf(found);
    if (fields === null) {
        return { kind: 'invalid', why: 'the answer holds no JSON object' };
    }
    const tasks = (Array.isArray(fields['tasks']) ? fields['tasks'] : []).flatMap((entry: unknown) => taskOf(entry, panes) ?? []);
    const regroup = typeof fields['regroup'] === 'string' ? nameOf(fields['regroup']) : '';
    if (tasks.length > 0) {
        return { kind: 'proposal', proposal: { tasks, regroup } };
    }
    const whole = sectionsFrom(fields);
    return whole === null
        ? { kind: 'invalid', why: 'the JSON object has none of the seven sections' }
        : { kind: 'proposal', proposal: { tasks: [{ name: '', lanes: panes, sections: whole }], regroup: '' } };
}
