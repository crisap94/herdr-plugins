import type { InputCandidate } from '#src/ports/recap-input.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isSection, type Section } from '#src/recap/domain/fact.ts';
import { QUOTE_CHARS, quotedIn } from '#src/recap/domain/quote.ts';
import type { Count } from '#src/contract/kernel.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { stubId, type MaterialScope } from './enumerate-input.ts';
import type { Stub } from './triggers.ts';
import { localTime } from './local-time.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { objectIn, tidy, type ParsedObject } from './recap-shape.ts';

const textOf = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

const WHY_WORDS = count(24);
const TEXT_WORDS = count(16);
const REF_WORDS = count(8);

type FieldName = 'stub' | 'anchor' | 'section' | 'text' | 'why' | 'ref' | 'at' | 'candidates' | 'skip' | 'reason';

export interface AnswerGround {
    readonly agent: Text;
    readonly entries: readonly Entry[];
    readonly stubs: readonly Stub[];
    readonly clock: Pick<MaterialScope, 'now' | 'zone'>;
}

export interface Answered {
    readonly candidates: readonly InputCandidate[];
    readonly filled: ReadonlySet<Text>;
    readonly skipped: ReadonlyMap<Text, Text>;
    readonly lost: Count;
}

interface Anchored {
    readonly anchor: Text;
    readonly stub: Text | null;
}

interface Candidate {
    readonly one: InputCandidate;
    readonly stub: Text | null;
}

export type Fields = ParsedObject;

export function parseFields(value: unknown): Fields | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? brand<object, 'ParsedObject'>(value) : null;
}

function textField(fields: ParsedObject, name: FieldName): Text | null {
    const value: unknown = Reflect.get(fields, name);
    return typeof value === 'string' ? textOf(value) : null;
}

function sectionField(fields: ParsedObject): Section | null {
    const value: unknown = Reflect.get(fields, 'section');
    return isSection(value) ? value : null;
}

function listField(fields: ParsedObject, name: FieldName): readonly (ParsedObject | null)[] | null {
    const value: unknown = Reflect.get(fields, name);
    return Array.isArray(value) ? value.map(parseFields) : null;
}

const maybe = (value: Text | null, words: Count): Text | null => {
    const one = value === null ? '' : tidy(value, words);
    return one === '' ? null : textOf(one);
};

const sayings = (entries: readonly Entry[]): Text => textOf(entries.map((entry) => `${entry.text}\n${entry.what ?? ''}`).join('\n'));

function resolveAt(label: Text | null, ground: AnswerGround): Instant | null {
    const { now, zone } = ground.clock;
    const found = label !== null ? ground.entries.findLast((entry) => entry.at !== undefined && localTime(instant(entry.at), now, zone) === label.trim())?.at : undefined;
    return found === undefined ? null : instant(found);
}

function headOf(quote: Text): Text {
    const body = quote.trim();
    if (body.length <= QUOTE_CHARS) {
        return textOf(body);
    }
    const cut = body.slice(0, QUOTE_CHARS + 1).search(/\s\S*$/);
    return textOf(body.slice(0, cut > 0 ? cut : QUOTE_CHARS).trimEnd());
}

function anchorOf(fields: ParsedObject, ground: AnswerGround, said: Text): Anchored | null {
    const named = textField(fields, 'stub');
    const stub = ground.stubs.find((_, at) => stubId(count(at)) === named);
    const raw = textField(fields, 'anchor');
    const quote = raw === null ? '' : headOf(raw);
    if (quote !== '' && quotedIn(quote, said)) {
        return { anchor: textOf(quote), stub: stub === undefined ? null : named };
    }
    return stub === undefined ? null : { anchor: stub.anchor, stub: named };
}

function candidateOf(fields: ParsedObject, ground: AnswerGround, said: Text): Candidate | null {
    const [section, text, found] = [sectionField(fields), maybe(textField(fields, 'text'), TEXT_WORDS), anchorOf(fields, ground, said)];
    if (!isSection(section) || text === null || found === null) {
        return null;
    }
    const one: InputCandidate = { section, text, why: maybe(textField(fields, 'why'), WHY_WORDS), ref: maybe(textField(fields, 'ref'), REF_WORDS), at: resolveAt(textField(fields, 'at'), ground), anchor: found.anchor, agent: ground.agent, flagged: brand<boolean, 'Flagged'>(false) };
    return { one, stub: found.stub };
}

const showing = (candidates: readonly InputCandidate[], stubs: readonly Stub[]): readonly Text[] =>
    stubs.flatMap((stub, at) => (candidates.some((one) => quotedIn(stub.anchor, one.anchor) || quotedIn(one.anchor, stub.anchor)) ? [stubId(count(at))] : []));

const skipOf = (skip: ParsedObject | null): readonly (readonly [Text, Text])[] => {
    const [stub, reason] = skip === null ? [null, null] : [textField(skip, 'stub'), textField(skip, 'reason')];
    return stub !== null && reason !== null && reason.trim() !== '' ? [[stub, textOf(reason.trim())] as const] : [];
};

export function answeredBy(text: Text, ground: AnswerGround): Answered | null {
    let parsed: ParsedObject | undefined;
    try {
        parsed = objectIn(text);
    } catch {
        return null;
    }
    const fields = parseFields(parsed);
    const listed = fields === null ? null : listField(fields, 'candidates');
    if (fields === null || listed === null) {
        return null;
    }
    const said = sayings(ground.entries);
    const made = listed.map((each) => (each === null ? null : candidateOf(each, ground, said)));
    const skipped = new Map((listField(fields, 'skip') ?? []).flatMap(skipOf));
    const candidates = made.flatMap((each) => each?.one ?? []);
    const named = made.flatMap((each) => each?.stub ?? []);
    return { candidates, filled: new Set([...named, ...showing(candidates, ground.stubs)]), skipped, lost: count(made.filter((each) => each === null).length) };
}
