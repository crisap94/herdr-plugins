import { ok } from './result.ts';
import type { Result } from './result.ts';
import { LIMITS, WORD_SHAPE, checkedText, refuse, requestId, tokenValue } from './primitives.ts';
import type { IdGrammar, Refusal, RequestId, TokenValue } from './primitives.ts';

export type FieldSpec =
    | { readonly kind: 'id'; readonly grammar: IdGrammar }
    | { readonly kind: 'word'; readonly name: string; readonly optional: boolean }
    | { readonly kind: 'flag'; readonly name: string; readonly text: string }
    | { readonly kind: 'rest'; readonly name: string; readonly optional: boolean; readonly maxChars: number | null };

type Field = Exclude<FieldSpec, { readonly kind: 'id' }>;
type RestField = Extract<Field, { readonly kind: 'rest' }>;

export type Fields = Readonly<Record<string, string | boolean | null>>;

export type ParsedValue = Fields & { readonly id: RequestId };

interface Layout {
    readonly grammar: IdGrammar;
    readonly fields: readonly Field[];
}

const isField = (spec: FieldSpec): spec is Field => spec.kind !== 'id';

function layoutOf(specs: readonly FieldSpec[]): Result<Layout, Refusal> {
    const [first, ...fields] = specs;
    if (first?.kind !== 'id' || !fields.every(isField)) {
        return refuse('bad-grammar', 'layout');
    }
    const restIsLast = fields.every((field, at) => field.kind !== 'rest' || at === fields.length - 1);
    if (!restIsLast || fields.some((field) => field.name === 'id')) {
        return refuse('bad-grammar', 'layout');
    }
    return ok({ grammar: first.grammar, fields });
}

const checkedRest = (field: RestField, text: string): Result<string, Refusal> =>
    field.maxChars !== null && text.length > field.maxChars ? refuse('too-long', field.name) : ok(text);

function pieceOf(field: Field, value: ParsedValue): Result<string | null, Refusal> {
    if (field.kind === 'flag') {
        return ok(value[field.name] === true ? field.text : null);
    }
    const text = value[field.name] ?? null;
    if (text === null) {
        return field.optional ? ok(null) : refuse('bad-grammar', field.name);
    }
    if (typeof text !== 'string') {
        return refuse('bad-grammar', field.name);
    }
    return field.kind === 'word' ? checkedText(field.name, text, LIMITS.valueMax, WORD_SHAPE) : checkedRest(field, text);
}

export function serializeValue(specs: readonly FieldSpec[], value: ParsedValue): Result<TokenValue, Refusal> {
    const layout = layoutOf(specs);
    if (layout.kind === 'err') {
        return layout;
    }
    const segments: string[] = [value.id];
    let absentSeen = false;
    for (const field of layout.value.fields) {
        const piece = pieceOf(field, value);
        if (piece.kind === 'err') {
            return piece;
        }
        if (piece.value === null) {
            absentSeen = true;
        } else if (absentSeen) {
            return refuse('bad-grammar', field.name);
        } else {
            segments.push(piece.value);
        }
    }
    return tokenValue(segments.join(':'));
}

interface Read {
    readonly value: string | boolean | null;
    readonly at: number;
}

function readField(field: Field, segments: readonly string[], at: number): Result<Read, Refusal> {
    const segment = segments[at];
    if (field.kind === 'flag') {
        const present = segment === field.text;
        return ok({ value: present, at: present ? at + 1 : at });
    }
    if (segment === undefined) {
        return field.optional ? ok({ value: null, at }) : refuse('bad-grammar', field.name);
    }
    if (field.kind === 'word') {
        const word = checkedText(field.name, segment, LIMITS.valueMax, WORD_SHAPE);
        return word.kind === 'ok' ? ok({ value: word.value, at: at + 1 }) : word;
    }
    const text = checkedRest(field, segments.slice(at).join(':'));
    return text.kind === 'ok' ? ok({ value: text.value, at: segments.length }) : text;
}

export function idGrammarOf(specs: readonly FieldSpec[]): Result<IdGrammar, Refusal> {
    const layout = layoutOf(specs);
    return layout.kind === 'err' ? layout : ok(layout.value.grammar);
}

export const idTextOf = (raw: string): string => {
    const cut = raw.indexOf(':');
    return cut < 0 ? raw : raw.slice(0, cut);
};

export function parseValue(specs: readonly FieldSpec[], raw: string): Result<ParsedValue, Refusal> {
    const layout = layoutOf(specs);
    if (layout.kind === 'err') {
        return layout;
    }
    const idText = idTextOf(raw);
    const id = requestId(idText, layout.value.grammar);
    if (id.kind === 'err') {
        return id;
    }
    const segments = raw.length === idText.length ? [] : raw.slice(idText.length + 1).split(':');
    const fields: Record<string, string | boolean | null> = {};
    let at = 0;
    for (const field of layout.value.fields) {
        const read = readField(field, segments, at);
        if (read.kind === 'err') {
            return read;
        }
        fields[field.name] = read.value.value;
        at = read.value.at;
    }
    return at < segments.length ? refuse('bad-grammar', 'layout') : ok({ ...fields, id: id.value });
}
