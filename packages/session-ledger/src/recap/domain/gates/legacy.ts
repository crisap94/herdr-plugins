import type { Fact } from '../fact.ts';
import type { Operation } from '../ops.ts';
import type { GatedSection, GateId } from './item-gate.ts';
import type { Gated } from './gatekeeper.ts';
import { wordsOf } from './words.ts';

export interface GateContext {
    readonly now: number;
    readonly language: string;
    readonly agents: readonly string[];
    readonly shown: ReadonlyMap<string, Fact>;
    readonly open: readonly Fact[];
    readonly closedLately: readonly Fact[];
    readonly source: string;
}

export interface Finding {
    readonly at: number;
    readonly gate: string;
    readonly outcome: 'refuse' | 'flag';
    readonly reason: string;
}

export interface Gate {
    readonly id: string;
    check(ops: readonly Operation[], context: GateContext): readonly Finding[];
}

export function docIdOf(fact: Fact, shown: ReadonlyMap<string, Fact>): string | null {
    return [...shown].find(([, each]) => each.id === fact.id)?.[0] ?? null;
}

export interface Item {
    readonly task: string;
    readonly section: GatedSection;
    readonly position: number;
    readonly text: string;
}

export interface Context {
    readonly language: string;
    readonly agents: readonly string[];
    readonly earlier: readonly Item[];
}

export interface Outcome {
    readonly kind: 'refuse' | 'flag';
    readonly gate: GateId;
    readonly reason: string;
}

export interface GateStats {
    readonly refused: Readonly<Record<string, number>>;
    readonly flagged: Readonly<Record<string, number>>;
    readonly dropped: number;
}

export const said = (language: string, en: string, es: string): string => (language === 'es' ? es : en);

function count(findings: readonly Finding[], into: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
    const counted: Record<string, number> = { ...into };
    for (const finding of findings) {
        counted[finding.gate] = (counted[finding.gate] ?? 0) + 1;
    }
    return counted;
}

export const addStats = (before: GateStats, found: Gated, dropped = 0): GateStats =>
    ({ refused: count(found.refused, before.refused), flagged: count(found.flagged, {}), dropped: before.dropped + dropped });

export function quoted(op: Operation): string {
    if (op.op === 'add') {
        return `add ${op.section} "${op.text}"`;
    }
    return op.op === 'update' ? `update ${op.id} "${op.text}"` : `close ${op.id}`;
}

export const correctionOf = (ops: readonly Operation[], refused: readonly Finding[]): string =>
    refused.map((finding) => {
        const op = ops[finding.at];
        return `${finding.gate}: ${op === undefined ? '?' : quoted(op)} — ${finding.reason}`;
    }).join('\n');

const withWhy = (section: Item['section'], text: string, why: string | null): string => (section === 'decisions' && why !== null ? `${text} — ${why}` : text);

export function itemOf(op: Operation, at: number, shown: ReadonlyMap<string, Fact>): Item | null {
    if (op.op === 'close') {
        return null;
    }
    const was = op.op === 'update' ? shown.get(op.id) : undefined;
    const section = op.op === 'add' ? op.section : was?.section;
    return section === undefined ? null : { task: '', section, position: at, text: withWhy(section, op.text, op.why ?? was?.why ?? null) };
}

const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });

export function textTokensOf(text: string): ReadonlySet<string> {
    return new Set([...WORDS.segment(text.toLowerCase())].filter((part) => part.isWordLike === true && Array.from(part.segment).length >= 3).map((part) => part.segment));
}

export function textJaccard(a: string, b: string): number {
    const [left, right] = [textTokensOf(a), textTokensOf(b)];
    const shared = [...left].filter((word) => right.has(word)).length;
    const union = left.size + right.size - shared;
    return union === 0 ? 0 : shared / union;
}

const ENGLISH = new Set(['the', 'and', 'of', 'to', 'is', 'are', 'with', 'for', 'in', 'on', 'that', 'this', 'it', 'was', 'were', 'has', 'have', 'been', 'will', 'not', 'from', 'after', 'before', 'when', 'until', 'because', 'but', 'its']);
const SPANISH = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'con', 'para', 'por', 'se', 'su', 'sus', 'al', 'lo', 'es', 'son', 'está', 'están', 'fue', 'sin', 'pero', 'hasta', 'después', 'antes', 'cuando', 'porque', 'ya']);

const hits = (words: readonly string[], list: ReadonlySet<string>): number => words.filter((word) => list.has(word)).length;

export type LineLanguage = 'en' | 'es';

export function languageOfLine(text: string): LineLanguage | null {
    const words = wordsOf(text).map((word) => word.toLowerCase());
    if (words.length < 4) {
        return null;
    }
    const en = hits(words, ENGLISH);
    const es = hits(words, SPANISH);
    if (en >= 2 && es === 0) {
        return 'en';
    }
    return es >= 2 && en === 0 ? 'es' : null;
}

const REFERENCE = [
    /^[!#]\d+$/u,
    /^[0-9a-f]{7,40}$/iu,
    /^https?:\/\/\S+$/iu,
    /^(?:main|master|develop|trunk|HEAD)$/u,
    /^[\p{L}\p{N}_.@~-]*\/[\p{L}\p{N}_./@~-]+$/u,
    /^[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.[A-Za-z][A-Za-z0-9]{0,7}$/u,
];

const bare = (token: string): string => token.replaceAll('`', '').replace(/^[("'[]+|[)"'\],;:]+$/gu, '').replace(/(?<=[^.])\.$/u, '');

export const hasReference = (text: string): boolean => text.split(/\s+/u).map(bare).some((token) => REFERENCE.some((form) => form.test(token)));

const OPENING = /^\W*([\p{L}\p{N}_-]+(?: [\p{L}\p{N}_-]+)?)(.*)$/su;

export function subjectOf(text: string, known: ReadonlySet<string>): { readonly rest: string } | null {
    const lowered = text.toLowerCase();
    const named = [...known].filter((name) => lowered.startsWith(name) && !/[\p{L}\p{N}_-]/u.test(lowered.charAt(name.length)));
    const longest = named.toSorted((a, b) => b.length - a.length)[0];
    if (longest !== undefined) {
        return { rest: text.slice(longest.length) };
    }
    const first = OPENING.exec(text)?.[1]?.toLowerCase();
    return first !== undefined && known.has(first) ? { rest: text.slice(first.length) } : null;
}
