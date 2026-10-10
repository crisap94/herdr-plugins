import type { InputAgent } from '#src/ports/recap-input.ts';
import { WRITER_CLOSES, isSection } from '#src/recap/domain/fact.ts';
import { ANCHOR_CHARS } from '#src/recap/domain/gates/g11-anchor.ts';
import type { ClosedWhy } from '#src/recap/domain/fact.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { localTime } from './local-time.ts';
import { objectIn, tidy } from './recap-shape.ts';

export const WHY_WORDS = 24;
const OLD_SHAPE = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'tasks', 'regroup'];

export interface Tasked {
    readonly task: string;
    readonly op: Operation;
}

export type Answer =
    | { readonly kind: 'ops'; readonly ops: readonly Tasked[]; readonly problems: readonly string[] }
    | { readonly kind: 'old-shape' }
    | { readonly kind: 'invalid'; readonly why: string };

export interface Resolving {
    readonly tasks: readonly string[];
    readonly agents: readonly InputAgent[];
    readonly taskOf: ReadonlyMap<string, string>;
    readonly turns: readonly number[];
    readonly clock: { readonly now: number; readonly zone: string };
}

const text = (value: unknown): string => (typeof value === 'string' ? tidy(value) : '');
const maybe = (value: unknown, words = 16): string | null => {
    const one = typeof value === 'string' ? tidy(value, words) : '';
    return one === '' ? null : one;
};

function resolveAt(label: unknown, resolving: Resolving): number | null {
    if (typeof label !== 'string' || label.trim() === '') {
        return null;
    }
    const { now, zone } = resolving.clock;
    return resolving.turns.findLast((at) => localTime(at, now, zone) === label.trim()) ?? null;
}

function anchorOf(value: unknown): string | null {
    const line = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    if (line.length <= ANCHOR_CHARS) {
        return line === '' ? null : line;
    }
    const cut = line.slice(0, ANCHOR_CHARS);
    const space = cut.lastIndexOf(' ');
    return (line.charAt(ANCHOR_CHARS) === ' ' || space <= 0 ? cut : cut.slice(0, space)).trim();
}

function taskFor(fields: Fields, resolving: Resolving): string {
    const id = typeof fields['id'] === 'string' ? resolving.taskOf.get(fields['id']) : undefined;
    const named = typeof fields['task'] === 'string' ? fields['task'] : id;
    return named !== undefined && resolving.tasks.includes(named) ? named : (resolving.tasks[0] ?? 't1');
}

type Fields = Readonly<Record<string, unknown>>;

const idOf = (fields: Fields): string => (typeof fields['id'] === 'string' ? fields['id'].trim() : '');

function addOf(fields: Fields, resolving: Resolving): Operation | string {
    const section = fields['section'];
    if (!isSection(section) || text(fields['text']) === '') {
        return 'an add needs a section (goal, now, needs, done, decisions, next, links or rules) and a text';
    }
    const label = resolving.agents.find((each) => each.id === fields['agent'])?.label;
    return { op: 'add', section, text: text(fields['text']), why: maybe(fields['why'], WHY_WORDS), ref: maybe(fields['ref'], 8), at: resolveAt(fields['at'], resolving), agent: label === undefined || label === '' ? null : label, anchor: anchorOf(fields['anchor']) };
}

function updateOf(fields: Fields): Operation | string {
    const [id, line] = [idOf(fields), text(fields['text'])];
    return id === '' || line === '' ? 'an update needs an id and a text' : { op: 'update', id, text: line, why: maybe(fields['why'], WHY_WORDS), anchor: anchorOf(fields['anchor']) };
}

function closeOf(fields: Fields): Operation | string {
    const id = idOf(fields);
    const reason: ClosedWhy | undefined = WRITER_CLOSES.find((each) => each === fields['why']);
    return id === '' ? 'a close needs an id' : { op: 'close', id, why: reason ?? null };
}

function operationOf(fields: Fields, resolving: Resolving): Operation | string {
    switch (fields['op']) {
        case 'add':
            return addOf(fields, resolving);
        case 'update':
            return updateOf(fields);
        case 'close':
            return closeOf(fields);
        default:
            return `"${String(fields['op'])}" is not an operation: use add, update or close`;
    }
}

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

function objectOf(raw: string): Fields | string {
    try {
        const found = objectIn(raw);
        return isFields(found) ? found : 'the answer holds no JSON object';
    } catch {
        return 'the answer is not valid JSON';
    }
}

export function parseAnswer(raw: string, resolving: Resolving): Answer {
    const fields = objectOf(raw);
    if (typeof fields === 'string') {
        return { kind: 'invalid', why: fields };
    }
    const listed = fields['ops'];
    if (!Array.isArray(listed)) {
        return OLD_SHAPE.some((key) => key in fields) ? { kind: 'old-shape' } : { kind: 'invalid', why: 'the JSON object has no "ops" list' };
    }
    const ops: Tasked[] = [];
    const problems: string[] = [];
    for (const entry of listed as unknown[]) {
        const one = isFields(entry) ? operationOf(entry, resolving) : 'an operation must be a JSON object';
        if (typeof one === 'string') {
            problems.push(one);
        } else {
            ops.push({ task: taskFor(entry as Fields, resolving), op: one });
        }
    }
    return { kind: 'ops', ops, problems };
}
