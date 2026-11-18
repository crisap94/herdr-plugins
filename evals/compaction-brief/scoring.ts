import { unfenced } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import { refusedIn, vetted } from '../../tab-recap/src/recap/application/compaction-brief.ts';
import { MESSAGE_LIMIT } from '../../tab-recap/src/recap/application/compaction-message.ts';
import { must } from '../../packages/session-ledger/src/protocol/result.ts';
import { parseText, type Text } from '../../packages/session-ledger/src/recap/domain/text.ts';
import { unparsed } from '../lib/scoring.ts';
import type { Answer, Graded, Judged, JudgeView, Mark } from '../lib/types.ts';
import { inputWordsIn, isEnglish, isPlain, unknownTokens } from './checks.ts';
import { documentOf, ownText, type BriefItem, type Pointer } from './prompt.ts';

export const CODE_CRITERIA: readonly string[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

export const LIMIT: number = MESSAGE_LIMIT;

const asText = (value: string): Text => must(parseText(value));

export const squash = (value: string): string => value.replace(/\s+/gu, ' ').trim();

export type Usability = 'empty' | 'refused' | 'ok';

export interface Inspected {
    readonly brief: string;
    readonly characters: number;
    readonly usability: Usability;
    readonly refused: readonly string[];
    readonly cut: boolean;
    readonly bait: readonly string[];
}

export function inspect(item: BriefItem, raw: string): Inspected {
    const brief = unfenced(raw);
    const own = asText(ownText(item));
    const line = squash(brief);
    const checked = vetted(asText(brief), own);
    const refused = refusedIn(asText(line), own).map((word) => String(word));
    const usability: Usability = line === '' ? 'empty' : checked.kind === 'ok' ? 'ok' : 'refused';
    const cut = checked.kind === 'ok' && checked.text.length < line.length;
    const bait = item.expected.planted.bait.flatMap((each) => each.invented).filter((token) => brief.includes(token));
    return { brief, characters: line.length, usability, refused, cut, bait };
}

export function grade(item: BriefItem, raw: string): Graded {
    const found = inspect(item, raw);
    if (found.usability === 'empty') return unparsed(CODE_CRITERIA);
    const own = ownText(item);
    const marks: Record<string, Mark> = {
        B1: found.usability === 'ok',
        B2: found.refused.length === 0,
        B3: inputWordsIn(found.brief, own).length === 0,
        B4: found.characters <= LIMIT,
        B5: isPlain(raw),
        B6: isEnglish(found.brief),
        B7: unknownTokens(found.brief, item.expected.allowed_tokens).length === 0,
    };
    return { parsed: found.usability === 'ok', marks };
}

const listed = (name: string, lines: readonly string[]): string => (lines.length === 0 ? `${name}: none` : [`${name}:`, ...lines.map((line) => `- ${line}`)].join('\n'));

const reasonOf = (item: BriefItem, pointer: Pointer): string => pointer.why ?? item.input.history[pointer.index]?.why ?? '';

export function view(item: BriefItem, raw: string): JudgeView {
    const { expected } = item;
    const lists = [
        `goal: ${expected.goal.text}`,
        listed('must_keep', expected.must_keep.map((pointer) => pointer.text)),
        listed('reasons', expected.reasons.map((pointer) => `${pointer.text} | reason: ${reasonOf(item, pointer)}`)),
        listed('waiting_on_operator', expected.waiting_on_operator.map((pointer) => pointer.text)),
        listed('settled', expected.settled.map((pointer) => pointer.text)),
        listed('must_not_reopen', expected.must_not_reopen.map((pointer) => pointer.text)),
    ].join('\n');
    return { case: `<document>\n${documentOf(item)}\n</document>\n<expected>\n${lists}\n</expected>`, answer: unfenced(raw) };
}

const sentence = (value: string): string => (/[.?!]$/u.test(value) ? value : `${value}.`);

const bare = (value: string): string => value.replace(/[.?!]$/u, '');

export function stubAnswer(item: BriefItem): string {
    const { expected } = item;
    const own = asText(ownText(item));
    const note = expected.note !== null && vetted(asText(expected.note), own).kind === 'ok' ? [`My note comes first: ${sentence(expected.note)}`] : [];
    const head = 'I want the summary to keep these, most important first.';
    const facts = expected.must_keep.map((pointer) => {
        const why = item.input.history[pointer.index]?.why ?? null;
        return why === null ? sentence(pointer.text) : `We decided: ${bare(pointer.text)}, because ${bare(why)}.`;
    });
    const settled = expected.settled.length === 0 ? [] : [`These are already settled and stay closed: ${expected.settled.map((pointer) => bare(pointer.text)).join('; ')}.`];
    const tail = 'Drop raw command output and the details of finished steps.';
    const build = (count: number, closed: readonly string[]): string => squash([...note, head, ...facts.slice(0, count), ...closed, tail].join(' '));
    const closed = build(facts.length, settled).length <= LIMIT ? settled : [];
    let count = facts.length;
    while (count > 0 && build(count, closed).length > LIMIT) count -= 1;
    return build(count, closed);
}

export interface Rate {
    readonly k: number;
    readonly n: number;
}

export interface ConfigExtras {
    readonly config: string;
    readonly answers: number;
    readonly usable: number;
    readonly empty: number;
    readonly refused: number;
    readonly refused_words: Readonly<Record<string, number>>;
    readonly characters_median: number | null;
    readonly characters_max: number | null;
    readonly over_limit: number;
    readonly cut_by_gate: number;
    readonly bait_answers: number;
    readonly bait_written: readonly string[];
    readonly gate_conflict_b2: Rate;
    readonly long_ledger_b4: Rate;
    readonly long_ledger_bj1: Rate;
    readonly judge_on_usable: Readonly<Record<string, Rate>>;
}

export interface Extras {
    readonly audit: string;
    readonly limit: number;
    readonly judge_criteria: readonly string[];
    readonly configs: readonly ConfigExtras[];
}

const median = (values: readonly number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
};

const rate = (marks: readonly Mark[]): Rate => ({ k: marks.filter((mark) => mark === true).length, n: marks.filter((mark) => mark !== null).length });

export function extras(items: readonly BriefItem[], answers: readonly Answer[], judged: ReadonlyMap<string, Judged>, configs: readonly string[], judgeCriteria: readonly string[], audit: string): Extras {
    const byId = new Map(items.map((item) => [item.id, item]));
    const rows = configs.map((config): ConfigExtras => {
        const mine = answers.flatMap((answer) => {
            const item = byId.get(answer.id);
            return answer.config === config && answer.text !== null && item !== undefined ? [{ answer, item, found: inspect(item, answer.text) }] : [];
        });
        const words: Record<string, number> = {};
        for (const { found } of mine) if (found.usability === 'refused') for (const word of new Set(found.refused.map((each) => each.toLowerCase()))) words[word] = (words[word] ?? 0) + 1;
        const lengths = mine.filter(({ found }) => found.usability !== 'empty').map(({ found }) => found.characters);
        const usable = mine.filter(({ found }) => found.usability === 'ok');
        const bait = mine.filter(({ item }) => item.expected.planted.bait.length > 0);
        const conflict = mine.filter(({ item }) => item.expected.planted.gate_conflict);
        const ledger = mine.filter(({ item }) => item.expected.planted.long_ledger);
        const verdict = (key: string, criterion: string): Mark => judged.get(key)?.verdicts[criterion]?.passed ?? null;
        const judge: Record<string, Rate> = {};
        for (const criterion of judgeCriteria) judge[criterion] = rate(usable.map(({ answer }) => verdict(answer.key, criterion)));
        return {
            config,
            answers: mine.length,
            usable: usable.length,
            empty: mine.filter(({ found }) => found.usability === 'empty').length,
            refused: mine.filter(({ found }) => found.usability === 'refused').length,
            refused_words: words,
            characters_median: median(lengths),
            characters_max: lengths.length === 0 ? null : Math.max(...lengths),
            over_limit: lengths.filter((length) => length > LIMIT).length,
            cut_by_gate: usable.filter(({ found }) => found.cut).length,
            bait_answers: bait.length,
            bait_written: bait.filter(({ found }) => found.bait.length > 0).map(({ answer, found }) => `${answer.id} r${answer.repetition}: ${found.bait.join(', ')}`),
            gate_conflict_b2: rate(conflict.map(({ found }) => found.refused.length === 0)),
            long_ledger_b4: rate(ledger.map(({ found }) => found.characters <= LIMIT)),
            long_ledger_bj1: rate(ledger.filter(({ found }) => found.usability === 'ok').map(({ answer }) => verdict(answer.key, 'BJ1'))),
            judge_on_usable: judge,
        };
    });
    return { audit, limit: LIMIT, judge_criteria: judgeCriteria, configs: rows };
}

const fraction = (value: Rate): string => `${value.k}/${value.n}`;

const cell = (value: number | null): string => (value === null ? '-' : String(value));

export function extrasMarkdown(found: Extras): string {
    const lines = [
        '',
        '## Compaction brief: reported, not marked',
        '',
        found.audit,
        '',
        `Characters are counted after whitespace is squashed, as the plugin's gate does; the limit is ${found.limit}. An answer the gate refuses gets no judge call: the library prints it as a fail on every judge criterion, while SPEC.md counts it missing, so the judge columns below are over usable answers only.`,
        '',
        '| Configuration | Answers | Usable | Empty | Refused | Refused words | Median chars | Max chars | Over limit | Cut by gate |',
        '|---|---|---|---|---|---|---|---|---|---|',
        ...found.configs.map((row) => `| ${row.config} | ${row.answers} | ${row.usable} | ${row.empty} | ${row.refused} | ${Object.entries(row.refused_words).map(([word, count]) => `${word} ${count}`).join(', ') || '-'} | ${cell(row.characters_median)} | ${cell(row.characters_max)} | ${row.over_limit} | ${row.cut_by_gate} |`),
        '',
        '### Planted cases reported apart',
        '',
        'cb-21: the operator\'s note itself says a word the gate refuses. A B2 fail there is first a conflict in the product; a pass means the model reworded the note.',
        '',
        '| Configuration | cb-21 B2 | Long ledgers B4 (fits) | Long ledgers BJ1 (usable) | Bait answers | Invented path written |',
        '|---|---|---|---|---|---|',
        ...found.configs.map((row) => `| ${row.config} | ${fraction(row.gate_conflict_b2)} | ${fraction(row.long_ledger_b4)} | ${fraction(row.long_ledger_bj1)} | ${row.bait_answers} | ${row.bait_written.join('; ') || 'none'} |`),
        '',
        '### Judge criteria over usable answers only (validation as in the table above)',
        '',
        `| Configuration | ${found.judge_criteria.join(' | ')} |`,
        `|---|${found.judge_criteria.map(() => '---').join('|')}|`,
        ...found.configs.map((row) => `| ${row.config} | ${found.judge_criteria.map((criterion) => fraction(row.judge_on_usable[criterion] ?? { k: 0, n: 0 })).join(' | ')} |`),
        '',
    ];
    return lines.join('\n');
}
