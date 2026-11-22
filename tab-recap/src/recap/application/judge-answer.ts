import type { Outcome } from '#src/ports/verdicts.ts';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { objectIn } from '@stateforge-labs/session-ledger/unstable/recap/application/recap-shape.ts';

export const ITEM_CHECKS: readonly Text[] = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'].map((check) => must(parseText(check)));

export interface ItemVerdict {
    readonly item: Text;
    readonly check: Text;
    readonly pass: Outcome;
    readonly critique: Text;
}

export interface Scored {
    readonly verdicts: readonly ItemVerdict[];
    readonly keyfacts: readonly Text[];
    readonly carried: ReadonlyMap<Count, Text | null>;
}

export interface Grade {
    readonly question: Count;
    readonly pass: boolean;
    readonly critique: Text;
}

export type Parsed<T> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'unusable'; readonly why: Text };

interface UnusableParse {
    readonly kind: 'unusable';
    readonly why: Text;
}

const unusable = (why: Text): UnusableParse => ({ kind: 'unusable', why });

type FieldName = 'verdicts' | 'keyfacts' | 'coverage' | 'answers' | 'grades' | 'item' | 'check' | 'pass' | 'critique' | 'keyfact' | 'question';

const FIELD_NAMES: readonly FieldName[] = ['verdicts', 'keyfacts', 'coverage', 'answers', 'grades', 'item', 'check', 'pass', 'critique', 'keyfact', 'question'];

type Fields = Readonly<Partial<Record<FieldName, Node>>>;

interface TextNode { readonly kind: 'text'; readonly text: Text }

interface CountNode { readonly kind: 'count'; readonly count: Count }

interface FlagNode { readonly kind: 'flag'; readonly outcome: Outcome }

interface ListNode { readonly kind: 'list'; readonly items: readonly Node[] }

interface ObjectNode { readonly kind: 'object'; readonly fields: Fields }

interface OtherNode { readonly kind: 'other' }

type Node = TextNode | CountNode | FlagNode | ListNode | ObjectNode | OtherNode;

const OTHER: OtherNode = { kind: 'other' };

const nodeOrOther = (parsed: Result<Node, ParseFailure>): Node => (parsed.kind === 'ok' ? parsed.value : OTHER);

export function parseNode(input: unknown): Result<Node, ParseFailure> {
    if (typeof input === 'string') {
        return ok({ kind: 'text', text: must(parseText(input)) });
    }
    if (typeof input === 'number') {
        const count = parseCount(input);
        return ok(count.kind === 'ok' ? { kind: 'count', count: count.value } : OTHER);
    }
    if (typeof input === 'boolean') {
        return ok({ kind: 'flag', outcome: input ? 'pass' : 'fail' });
    }
    if (Array.isArray(input)) {
        return ok({ kind: 'list', items: input.map((item): Node => nodeOrOther(parseNode(item))) });
    }
    if (typeof input === 'object' && input !== null) {
        const fields: Partial<Record<FieldName, Node>> = {};
        for (const name of FIELD_NAMES) {
            const value: unknown = Reflect.get(input, name);
            fields[name] = nodeOrOther(parseNode(value));
        }
        return ok({ kind: 'object', fields });
    }
    return err({ kind: 'out-of-range' });
}

function fieldsOf(text: Text): Fields | Text {
    try {
        const found = nodeOrOther(parseNode(objectIn(text)));
        return found.kind === 'object' ? found.fields : must(parseText('the answer holds no JSON object'));
    } catch {
        return must(parseText('the answer is not valid JSON'));
    }
}

const itemsIn = (node: Node | undefined): readonly Node[] => (node?.kind === 'list' ? node.items : []);

const entries = (node: Node | undefined): readonly Fields[] => itemsIn(node).flatMap((entry): Fields[] => (entry.kind === 'object' ? [entry.fields] : []));

const lineOf = (node: Node | undefined): Text => must(parseText(node?.kind === 'text' ? node.text.replace(/\s+/g, ' ').trim() : ''));

const checksOf = (section: Text): readonly Text[] => [...ITEM_CHECKS, must(parseText(`S-${section}`))];

const passOf = (node: Node | undefined): Outcome | null => (node?.kind === 'flag' ? node.outcome : null);

const NO_CRITIQUE: Text = must(parseText('(no critique)'));

const critiqueOf = (entry: Fields): Text => lineOf(entry.critique) || NO_CRITIQUE;

function verdictsOf(raw: Node | undefined, sections: ReadonlyMap<Text, Text>): readonly ItemVerdict[] {
    const seen = new Set<Text>();
    return entries(raw).flatMap((entry): ItemVerdict[] => {
        const item = lineOf(entry.item);
        const check = lineOf(entry.check);
        const pass = passOf(entry.pass);
        const section = sections.get(item);
        const pair = must(parseText(`${item}|${check}`));
        if (section === undefined || !checksOf(section).includes(check) || pass === null || seen.has(pair)) {
            return [];
        }
        seen.add(pair);
        return [{ item, check, pass, critique: pass === 'pass' ? must(parseText('')) : critiqueOf(entry) }];
    });
}

function carriedBy(raw: Node | undefined, count: Count, sections: ReadonlyMap<Text, Text>): ReadonlyMap<Count, Text | null> {
    const carried = new Map<Count, Text | null>();
    for (const entry of entries(raw)) {
        const at = entry.keyfact;
        const item = lineOf(entry.item);
        if (at?.kind === 'count' && at.count < count && !carried.has(at.count)) {
            carried.set(at.count, sections.has(item) ? item : null);
        }
    }
    return carried;
}

const factsIn = (node: Node | undefined): readonly Text[] => itemsIn(node).map(lineOf).filter((fact) => fact !== '');

export function parseScore(text: Text, sections: ReadonlyMap<Text, Text>, carriers: ReadonlyMap<Text, Text> = sections): Parsed<Scored> {
    const fields = fieldsOf(text);
    if (typeof fields === 'string') {
        return unusable(fields);
    }
    const verdicts = verdictsOf(fields.verdicts, sections);
    const keyfacts = factsIn(fields.keyfacts);
    if (verdicts.length === 0 || fields.keyfacts?.kind !== 'list' || fields.coverage?.kind !== 'list') {
        return unusable(must(parseText('the answer has no usable verdicts, key facts and coverage')));
    }
    return { kind: 'ok', value: { verdicts, keyfacts, carried: carriedBy(fields.coverage, must(parseCount(keyfacts.length)), carriers) } };
}

export interface Covered {
    readonly keyfacts: readonly Text[];
    readonly carried: ReadonlyMap<Count, Text | null>;
}

export function parseCover(text: Text, carriers: ReadonlyMap<Text, Text>, given: readonly Text[] | null): Parsed<Covered> {
    const fields = fieldsOf(text);
    if (typeof fields === 'string') {
        return unusable(fields);
    }
    const keyfacts = given ?? factsIn(fields.keyfacts);
    if (fields.coverage?.kind !== 'list' || keyfacts.length === 0) {
        return unusable(must(parseText('the answer has no key facts and coverage')));
    }
    return { kind: 'ok', value: { keyfacts, carried: carriedBy(fields.coverage, must(parseCount(keyfacts.length)), carriers) } };
}

export function parseAnswers(text: Text): Parsed<readonly Text[]> {
    const fields = fieldsOf(text);
    if (typeof fields === 'string') {
        return unusable(fields);
    }
    const answers = itemsIn(fields.answers);
    return fields.answers?.kind === 'list' && answers.length === 6 && answers.every((answer) => answer.kind === 'text')
        ? { kind: 'ok', value: answers.map(lineOf) }
        : unusable(must(parseText('the answer is not six strings')));
}

const QUESTIONS: readonly Count[] = [1, 2, 3, 4, 5, 6].map((question) => must(parseCount(question)));

export function parseGrades(text: Text): Parsed<readonly Grade[]> {
    const fields = fieldsOf(text);
    if (typeof fields === 'string') {
        return unusable(fields);
    }
    const grades = entries(fields.grades).flatMap((entry): Grade[] => {
        const question = entry.question;
        const pass = passOf(entry.pass);
        return question?.kind === 'count' && question.count >= 1 && question.count <= 6 && pass !== null
            ? [{ question: question.count, pass: pass === 'pass', critique: pass === 'pass' ? must(parseText('')) : critiqueOf(entry) }]
            : [];
    });
    const byQuestion = QUESTIONS.flatMap((question) => grades.find((grade) => grade.question === question) ?? []);
    return byQuestion.length === 6 ? { kind: 'ok', value: byQuestion } : unusable(must(parseText('the answer does not grade all six questions')));
}
