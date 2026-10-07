// The judge's three answers, checked like the writer's: JSON, the right shape, nothing the document did not name. Pure; unusable is a value, never a throw.
import { objectIn } from './recap-shape.ts';

export const ITEM_CHECKS: readonly string[] = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'];

export interface ItemVerdict {
    readonly item: string;
    readonly check: string;
    readonly pass: boolean;
    readonly critique: string;
}

export interface Scored {
    readonly verdicts: readonly ItemVerdict[];
    readonly keyfacts: readonly string[];
    /** which item carries each key fact (null: none does), by key fact index */
    readonly carried: ReadonlyMap<number, string | null>;
}

export interface Grade {
    readonly question: number;
    readonly pass: boolean;
    readonly critique: string;
}

export type Parsed<T> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'unusable'; readonly why: string };

const unusable = (why: string): { readonly kind: 'unusable'; readonly why: string } => ({ kind: 'unusable', why });

type Fields = Readonly<Record<string, unknown>>;

function fieldsOf(text: string): Fields | string {
    try {
        const found = objectIn(text);
        return typeof found === 'object' && found !== null && !Array.isArray(found) ? (found as Fields) : 'the answer holds no JSON object';
    } catch {
        return 'the answer is not valid JSON';
    }
}

const entries = (value: unknown): readonly Fields[] =>
    (Array.isArray(value) ? value : []).filter((entry: unknown): entry is Fields => typeof entry === 'object' && entry !== null && !Array.isArray(entry));

const lineOf = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** The checks an item can be given: I1…I7 and the one of its own section. */
const checksOf = (section: string): readonly string[] => [...ITEM_CHECKS, `S-${section}`];

/** The verdicts that name a known item and one of its checks, the first of each pair. */
function verdictsOf(raw: unknown, sections: ReadonlyMap<string, string>): readonly ItemVerdict[] {
    const seen = new Set<string>();
    return entries(raw).flatMap((entry): ItemVerdict[] => {
        const item = lineOf(entry['item']);
        const check = lineOf(entry['check']);
        const pass = entry['pass'];
        const section = sections.get(item);
        if (section === undefined || !checksOf(section).includes(check) || typeof pass !== 'boolean' || seen.has(`${item}|${check}`)) {
            return [];
        }
        seen.add(`${item}|${check}`);
        return [{ item, check, pass, critique: pass ? '' : (lineOf(entry['critique']) || '(no critique)') }];
    });
}

/** Which known item carries each key fact; a fact named twice keeps its first. */
function carriedBy(raw: unknown, count: number, sections: ReadonlyMap<string, string>): ReadonlyMap<number, string | null> {
    const carried = new Map<number, string | null>();
    for (const entry of entries(raw)) {
        const at = entry['keyfact'];
        const item = lineOf(entry['item']);
        if (typeof at === 'number' && Number.isInteger(at) && at >= 0 && at < count && !carried.has(at)) {
            carried.set(at, sections.has(item) ? item : null);
        }
    }
    return carried;
}

/** Score answer: verdicts for known items and checks, the key facts, and which item carries which. `sections` maps each item key to its section. */
export function parseScore(text: string, sections: ReadonlyMap<string, string>): Parsed<Scored> {
    const fields = fieldsOf(text);
    if (typeof fields === 'string') {
        return unusable(fields);
    }
    const verdicts = verdictsOf(fields['verdicts'], sections);
    const keyfacts = (Array.isArray(fields['keyfacts']) ? fields['keyfacts'] : []).map(lineOf).filter((fact) => fact !== '');
    if (verdicts.length === 0 || !Array.isArray(fields['keyfacts']) || !Array.isArray(fields['coverage'])) {
        return unusable('the answer has no usable verdicts, key facts and coverage');
    }
    return { kind: 'ok', value: { verdicts, keyfacts, carried: carriedBy(fields['coverage'], keyfacts.length, sections) } };
}

/** Read-back answer: exactly six strings. */
export function parseAnswers(text: string): Parsed<readonly string[]> {
    const fields = fieldsOf(text);
    const answers = typeof fields === 'string' ? [] : fields['answers'];
    if (typeof fields === 'string') {
        return unusable(fields);
    }
    return Array.isArray(answers) && answers.length === 6 && answers.every((answer: unknown) => typeof answer === 'string')
        ? { kind: 'ok', value: answers.map(lineOf) }
        : unusable('the answer is not six strings');
}

/** Grading answer: a grade for each of the six questions. */
export function parseGrades(text: string): Parsed<readonly Grade[]> {
    const fields = fieldsOf(text);
    if (typeof fields === 'string') {
        return unusable(fields);
    }
    const grades = entries(fields['grades']).flatMap((entry): Grade[] => {
        const question = entry['question'];
        return typeof question === 'number' && Number.isInteger(question) && question >= 1 && question <= 6 && typeof entry['pass'] === 'boolean'
            ? [{ question, pass: entry['pass'], critique: entry['pass'] ? '' : (lineOf(entry['critique']) || '(no critique)') }]
            : [];
    });
    const byQuestion = [1, 2, 3, 4, 5, 6].flatMap((question) => grades.find((grade) => grade.question === question) ?? []);
    return byQuestion.length === 6 ? { kind: 'ok', value: byQuestion } : unusable('the answer does not grade all six questions');
}
