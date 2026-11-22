import type { Count } from '#src/contract/kernel.ts';
import type { InputAgent } from '#src/ports/recap-input.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { WRITER_CLOSES, isSection, type FactId } from '#src/recap/domain/fact.ts';
import type { ClosedWhy, Section } from '#src/recap/domain/fact.ts';
import { ANCHOR_CHARS } from '#src/recap/domain/gates/g11-anchor.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { parseFields } from './enumerate-answer.ts';
import type { MaterialTab } from './enumerate-input.ts';
import { localTime } from './local-time.ts';
import { objectIn, tidy } from './recap-shape.ts';
import type { ParsedObject } from './recap-shape.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

export const WHY_WORDS = count(24);
const REF_WORDS = count(8);
const MAYBE_WORDS = count(16);
const OLD_SHAPE: readonly Text[] = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'tasks', 'regroup'].map(textOf);

type FieldName = 'id' | 'task' | 'section' | 'text' | 'why' | 'ref' | 'at' | 'agent' | 'anchor' | 'op' | 'ops';

export interface Tasked {
    readonly task: Text;
    readonly op: Operation;
}

export type Answer =
    | { readonly kind: 'ops'; readonly ops: readonly Tasked[]; readonly problems: readonly Text[] }
    | { readonly kind: 'old-shape' }
    | { readonly kind: 'invalid'; readonly why: Text };

export interface Resolving {
    readonly tasks: readonly Text[];
    readonly agents: readonly InputAgent[];
    readonly taskOf: ReadonlyMap<Text, Text>;
    readonly turns: readonly Instant[];
    readonly clock: Pick<MaterialTab, 'now' | 'zone'>;
}

function rawField(fields: ParsedObject, name: FieldName): Text | null {
    const value: unknown = Reflect.get(fields, name);
    return typeof value === 'string' ? textOf(value) : null;
}

function sectionField(fields: ParsedObject): Section | null {
    const value: unknown = Reflect.get(fields, 'section');
    return isSection(value) ? value : null;
}

const tidied = (fields: ParsedObject, name: FieldName): Text => {
    const value = rawField(fields, name);
    return value === null ? textOf('') : tidy(value);
};

const maybe = (fields: ParsedObject, name: FieldName, words: Count = MAYBE_WORDS): Text | null => {
    const value = rawField(fields, name);
    const one = value === null ? '' : tidy(value, words);
    return one === '' ? null : one;
};

function resolveAt(fields: ParsedObject, resolving: Resolving): Instant | null {
    const label = rawField(fields, 'at');
    if (label === null || label.trim() === '') {
        return null;
    }
    const { now, zone } = resolving.clock;
    return resolving.turns.findLast((at) => localTime(at, now, zone) === label.trim()) ?? null;
}

function anchorOf(fields: ParsedObject): Text | null {
    const value = rawField(fields, 'anchor');
    const line = value === null ? '' : value.replace(/\s+/g, ' ').trim();
    if (line.length <= ANCHOR_CHARS) {
        return line === '' ? null : textOf(line);
    }
    const cut = line.slice(0, ANCHOR_CHARS);
    const space = cut.lastIndexOf(' ');
    return textOf((line.charAt(ANCHOR_CHARS) === ' ' || space <= 0 ? cut : cut.slice(0, space)).trim());
}

function taskFor(fields: ParsedObject, resolving: Resolving): Text {
    const asked = rawField(fields, 'id');
    const id = asked === null ? undefined : resolving.taskOf.get(asked);
    const named = rawField(fields, 'task') ?? id;
    return named !== undefined && resolving.tasks.includes(named) ? named : (resolving.tasks[0] ?? textOf('t1'));
}

const idOf = (fields: ParsedObject): FactId => brand<string, 'FactId'>(rawField(fields, 'id')?.trim() ?? '');

function addOf(fields: ParsedObject, resolving: Resolving): Operation | Text {
    const section = sectionField(fields);
    const text = tidied(fields, 'text');
    if (section === null || text === '') {
        return textOf('an add needs a section (goal, now, needs, done, decisions, next, links or rules) and a text');
    }
    const named = rawField(fields, 'agent');
    const label = resolving.agents.find((each) => each.id === named)?.label;
    return { op: 'add', section, text, why: maybe(fields, 'why', WHY_WORDS), ref: maybe(fields, 'ref', REF_WORDS), at: resolveAt(fields, resolving), agent: label === undefined || label === '' ? null : label, anchor: anchorOf(fields) };
}

function updateOf(fields: ParsedObject): Operation | Text {
    const [id, line] = [idOf(fields), tidied(fields, 'text')];
    return id === '' || line === '' ? textOf('an update needs an id and a text') : { op: 'update', id, text: line, why: maybe(fields, 'why', WHY_WORDS), anchor: anchorOf(fields) };
}

function closeOf(fields: ParsedObject): Operation | Text {
    const id = idOf(fields);
    const asked: unknown = Reflect.get(fields, 'why');
    const reason: ClosedWhy | undefined = WRITER_CLOSES.find((each) => each === asked);
    const anchor = anchorOf(fields);
    if (id === '') {
        return textOf('a close needs an id');
    }
    return anchor === null ? { op: 'close', id, why: reason ?? null } : { op: 'close', id, why: reason ?? null, anchor };
}

function operationOf(fields: ParsedObject, resolving: Resolving): Operation | Text {
    switch (rawField(fields, 'op')) {
        case 'add':
            return addOf(fields, resolving);
        case 'update':
            return updateOf(fields);
        case 'close':
            return closeOf(fields);
        default:
            return textOf(`"${String(Reflect.get(fields, 'op'))}" is not an operation: use add, update or close`);
    }
}

function objectOf(raw: Text): ParsedObject | Text {
    try {
        const found = parseFields(objectIn(raw));
        return found ?? textOf('the answer holds no JSON object');
    } catch {
        return textOf('the answer is not valid JSON');
    }
}

function listedIn(fields: ParsedObject): readonly (ParsedObject | null)[] | null {
    const value: unknown = Reflect.get(fields, 'ops');
    return Array.isArray(value) ? value.map(parseFields) : null;
}

export function parseAnswer(raw: Text, resolving: Resolving): Answer {
    const fields = objectOf(raw);
    if (typeof fields === 'string') {
        return { kind: 'invalid', why: fields };
    }
    const listed = listedIn(fields);
    if (listed === null) {
        return OLD_SHAPE.some((key) => key in fields) ? { kind: 'old-shape' } : { kind: 'invalid', why: textOf('the JSON object has no "ops" list') };
    }
    const ops: Tasked[] = [];
    const problems: Text[] = [];
    for (const entry of listed) {
        const one = entry === null ? textOf('an operation must be a JSON object') : operationOf(entry, resolving);
        if (typeof one === 'string') {
            problems.push(one);
        } else if (entry !== null) {
            ops.push({ task: taskFor(entry, resolving), op: one });
        }
    }
    return { kind: 'ops', ops, problems };
}
