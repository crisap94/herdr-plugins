import { ok } from './result.ts';
import type { Result } from './result.ts';
import { LIMITS, WORD_SHAPES, parseWord, refuse, parseRequestId, parseIdText, parseTokenValue, parseFieldText, parseFlagFieldText, parseRestText, parseSegmentStart, parseNextSegment, parseSegmentEnd } from './primitives.ts';
import type { CharLimit, FieldName, FieldText, FieldValue, FlagText, IdGrammar, IdText, Presence, Refusal, RequestId, SegmentIndex, TokenValue, WireText, WordShape } from './primitives.ts';

export interface IdSpec {
    readonly kind: 'id';
    readonly grammar: IdGrammar;
}

export interface WordSpec {
    readonly kind: 'word';
    readonly name: FieldName;
    readonly presence: Presence;
    readonly shape?: WordShape;
}

export interface FlagSpec {
    readonly kind: 'flag';
    readonly name: FieldName;
    readonly text: FlagText;
}

export interface RestSpec {
    readonly kind: 'rest';
    readonly name: FieldName;
    readonly presence: Presence;
    readonly maxChars: CharLimit | null;
}

export type FieldSpec = IdSpec | WordSpec | FlagSpec | RestSpec;

type Field = Exclude<FieldSpec, { readonly kind: 'id' }>;
type RestField = Extract<Field, { readonly kind: 'rest' }>;

const shapeOf = (shape: WordShape | undefined): RegExp => WORD_SHAPES[shape ?? 'word'];

export interface ParsedValue {
    readonly [field: string]: FieldValue | RequestId;
    readonly id: RequestId;
}

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

const checkedRest = (field: RestField, text: FieldText): Result<FieldText, Refusal> =>
    field.maxChars !== null && text.length > field.maxChars ? refuse('too-long', field.name) : ok(text);

function pieceOf(field: Field, value: ParsedValue): Result<FieldText | null, Refusal> {
    if (field.kind === 'flag') {
        return ok(value[field.name] === true ? parseFlagFieldText(field.text) : null);
    }
    const raw = value[field.name] ?? null;
    if (raw === null) {
        return field.presence === 'optional' ? ok(null) : refuse('bad-grammar', field.name);
    }
    const text = parseFieldText(raw);
    if (text.kind === 'err') {
        return refuse(text.error, field.name);
    }
    if (field.kind === 'word') {
        const word = parseWord(text.value, LIMITS.valueMax, shapeOf(field.shape));
        return word.kind === 'ok' ? ok(text.value) : refuse(word.error, field.name);
    }
    return checkedRest(field, text.value);
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
    return parseTokenValue(segments.join(':'));
}

interface Read {
    readonly value: FieldValue;
    readonly at: SegmentIndex;
}

function readField(field: Field, segments: readonly FieldText[], at: SegmentIndex): Result<Read, Refusal> {
    const segment = segments[at];
    if (field.kind === 'flag') {
        const present = segment === parseFlagFieldText(field.text);
        return ok({ value: present, at: present ? parseNextSegment(at) : at });
    }
    if (segment === undefined) {
        return field.presence === 'optional' ? ok({ value: null, at }) : refuse('bad-grammar', field.name);
    }
    if (field.kind === 'word') {
        const word = parseWord(segment, LIMITS.valueMax, shapeOf(field.shape));
        return word.kind === 'ok' ? ok({ value: segment, at: parseNextSegment(at) }) : refuse(word.error, field.name);
    }
    const text = checkedRest(field, parseRestText(segments.slice(at)));
    return text.kind === 'ok' ? ok({ value: text.value, at: parseSegmentEnd(segments) }) : text;
}

export function idGrammarOf(specs: readonly FieldSpec[]): Result<IdGrammar, Refusal> {
    const layout = layoutOf(specs);
    return layout.kind === 'err' ? layout : ok(layout.value.grammar);
}

export function parseValue(specs: readonly FieldSpec[], raw: WireText): Result<ParsedValue, Refusal> {
    const layout = layoutOf(specs);
    if (layout.kind === 'err') {
        return layout;
    }
    const idText: IdText = parseIdText(raw);
    const id = parseRequestId(idText, layout.value.grammar);
    if (id.kind === 'err') {
        return id;
    }
    const segments: FieldText[] = [];
    for (const part of raw.length === idText.length ? [] : raw.slice(idText.length + 1).split(':')) {
        const text = parseFieldText(part);
        if (text.kind === 'err') {
            return refuse(text.error, 'layout');
        }
        segments.push(text.value);
    }
    const fields: Record<string, FieldValue> = {};
    let at = parseSegmentStart();
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
