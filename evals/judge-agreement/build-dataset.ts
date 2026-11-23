import { writeFileSync } from 'node:fs';
import { writerContext } from '../../packages/session-ledger/src/recap/application/writer-context.ts';
import type { RecapRequest } from '../../packages/session-ledger/src/ports/summarizer.ts';
import type { InputFact } from '../../packages/session-ledger/src/ports/recap-input.ts';
import type { DatasetRow } from './row.ts';
import type { Entry } from '../../packages/session-ledger/src/ports/transcripts.ts';
import { CASES_A } from './cases-a.ts';
import { CASES_B } from './cases-b.ts';
import type { Beat, Case, Planted, Section } from './cases-types.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';
import { instant } from '../../packages/session-ledger/src/recap/domain/time.ts';
import { agentKindOf, paneIdOf } from '../../packages/session-ledger/src/recap/domain/lane-shape.ts';
import { directoryOf } from '../lib/brands.ts';

const SECTIONS: readonly Section[] = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'];
const ITEM_CHECKS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'] as const;
const TASK = 't1';
const STEP_MS = 40_000;
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const AREAS = ['core', 'util', 'io', 'fmt', 'cli', 'net', 'store', 'view'] as const;
const NOUNS = ['ledger', 'parser', 'buffer', 'mapper', 'digest', 'planner', 'window', 'signal', 'frame', 'socket', 'timer', 'codec'] as const;

type Mark = 'pass' | 'fail' | 'open';

function mulberry(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

interface Dice {
    readonly int: (low: number, high: number) => number;
    readonly pick: <T>(list: readonly T[]) => T;
}

function diceOf(seed: number): Dice {
    const next = mulberry(seed);
    const int = (low: number, high: number): number => low + Math.floor(next() * (high - low + 1));
    return { int, pick: <T>(list: readonly T[]): T => list[int(0, list.length - 1)] as T };
}

const two = (value: number): string => String(value).padStart(2, '0');

const lines = (count: number, line: (at: number) => string): string => Array.from({ length: count }, (_, at) => line(at)).join('\n');

function fillerTool(dice: Dice): Beat {
    const noun = dice.pick(NOUNS);
    const area = dice.pick(AREAS);
    const file = `src/${area}/${noun}-${two(dice.int(1, 40))}.ts`;
    const kind = dice.int(0, 3);
    if (kind === 0) {
        const count = dice.int(6, 14);
        const unit = `test/unit/${noun}-${two(dice.int(1, 40))}.test.ts`;
        return { role: 'tool', what: `bun test ${unit}`, text: `${unit}:\n${lines(count, (at) => `(pass) ${noun} > case ${at + 1} [${dice.int(1, 90)}.00ms]`)}\n\n ${count} pass\n 0 fail` };
    }
    if (kind === 1) {
        return { role: 'tool', what: `rg -n "${noun}" src/${area}`, text: lines(dice.int(5, 12), () => `src/${area}/${noun}-${two(dice.int(1, 40))}.ts:${dice.int(3, 480)}:    const ${noun}Size = ${dice.int(2, 4096)};`) };
    }
    if (kind === 2) {
        return { role: 'tool', what: 'git status --short', text: lines(dice.int(2, 5), () => ` M src/${dice.pick(AREAS)}/${dice.pick(NOUNS)}-${two(dice.int(1, 40))}.ts`) };
    }
    return { role: 'tool', what: `wc -l ${file}`, text: `${dice.int(20, 900)} ${file}` };
}

function fillerTurn(dice: Dice, language: 'en' | 'es'): Beat {
    const noun = dice.pick(NOUNS);
    const area = dice.pick(AREAS);
    const file = `src/${area}/${noun}-${two(dice.int(1, 40))}.ts`;
    const unit = `test/unit/${noun}-${two(dice.int(1, 40))}.test.ts`;
    const sites = dice.int(2, 9);
    const english = [
        `Checked \`${file}\`: it does not touch this change, so I am leaving it as it is.`,
        `The unit file \`${unit}\` passes unchanged.`,
        `Read through \`src/${area}/\` to see who calls the \`${noun}\` helper: ${sites} call sites, none of them affected.`,
        `Formatting only in \`${file}\`, no behaviour change.`,
    ];
    const spanish = [
        `Revisé \`${file}\`: no toca este cambio, así que lo dejo como está.`,
        `El fichero de pruebas \`${unit}\` pasa sin cambios.`,
        `Recorrí \`src/${area}/\` para ver quién llama al auxiliar \`${noun}\`: ${sites} usos, ninguno afectado.`,
        `Solo formato en \`${file}\`, sin cambio de comportamiento.`,
    ];
    return { role: 'agent', text: dice.pick(language === 'es' ? spanish : english) };
}

function fillerGroup(dice: Dice, language: 'en' | 'es'): readonly Beat[] {
    return [...Array.from({ length: dice.int(1, 3) }, () => fillerTool(dice)), fillerTurn(dice, language)];
}

const weight = (beats: readonly Beat[]): number => beats.reduce((sum, beat) => sum + beat.text.length + (beat.what?.length ?? 0) + 60, 0);

function storyOf(one: Case): readonly Beat[] {
    const says = one.items.filter((item) => item.end !== true).flatMap((item) => (item.say === undefined ? [] : [item.say]));
    const laters = one.items.flatMap((item) => (item.later === undefined ? [] : [item.later]));
    const ends = one.items.filter((item) => item.end === true).flatMap((item) => (item.say === undefined ? [] : [item.say]));
    return [{ role: 'user', text: one.opening }, ...says, ...laters, ...ends];
}

function beatsOf(one: Case, dice: Dice): readonly Beat[] {
    const story = storyOf(one);
    const gaps: Beat[][] = story.map(() => []);
    let size = weight(story) + 900;
    let at = 0;
    while (size < one.target) {
        const group = fillerGroup(dice, one.language);
        gaps[1 + (at % (gaps.length - 1))]?.push(...group);
        size += weight(group);
        at += 1;
    }
    return story.flatMap((beat, index) => [...(gaps[index] ?? []), beat]);
}

function entriesOf(beats: readonly Beat[], now: number): readonly Entry[] {
    const start = now - (beats.length + 1) * STEP_MS;
    return beats.map((beat, index): Entry => (beat.role === 'tool'
        ? { role: 'tool', text: textOf(beat.text), kind: 'shell', what: textOf(beat.what ?? '') }
        : { role: beat.role, text: textOf(beat.text), at: instant(start + index * STEP_MS) }));
}

const idOf = (dice: Dice): string => `fct_01${Array.from({ length: 24 }, () => ALPHABET[dice.int(0, 31)]).join('')}`;

const quoteOf = (text: string): string => text.slice(0, 120);

function priorFacts(one: Case, now: number): readonly InputFact[] {
    return one.prior.map(([section, text], index): InputFact => ({
        id: textOf(`f${index + 1}`), section, text: textOf(text), state: 'open', first: instant(now - 3 * 3_600_000 + index * 60_000), last: instant(now - 2 * 3_600_000 + index * 60_000),
        why: section === 'decisions' ? textOf(text.slice(text.indexOf(': ') + 2)) : null, ref: null, anchor: textOf(quoteOf(text)), agent: null, closed: null,
    }));
}

function requestOf(one: Case, beats: readonly Beat[], now: number): RecapRequest {
    return {
        language: textOf(one.language),
        previousLanguage: textOf(one.language),
        input: {
            tab: { id: textOf(`w${one.n}:t1`), now: instant(now), zone: textOf('UTC') },
            agents: [{ id: textOf('a1'), kind: agentKindOf(one.kind), label: textOf(one.label), pane: paneIdOf(`w${one.n}-1`), source: 'transcript', cwd: directoryOf(one.repo), repo: directoryOf(one.repo), branch: textOf(one.branch), files: [] }],
            tasks: [],
            ledgers: [{ task: null, facts: priorFacts(one, now) }],
            notes: [],
            transcripts: [{ agent: textOf('a1'), entries: entriesOf(beats, now) }],
        },
    };
}

interface Keyed {
    readonly item: Planted;
    readonly index: number;
    readonly key: string;
    readonly stateKey: string;
}

function keyed(one: Case): readonly Keyed[] {
    return SECTIONS.flatMap((section) => {
        const before = one.prior.filter(([mine]) => mine === section).length;
        return one.items.flatMap((item, index) => (item.section === section ? [{ item, index }] : []))
            .map(({ item, index }, position): Keyed => ({ item, index, key: `${TASK}/${section}/${position}`, stateKey: `state/${TASK}/${section}/${before + position}` }));
    });
}

function anchorOf(one: Case, item: Planted): string {
    const source = item.say ?? (item.rewords === undefined ? undefined : one.items[item.rewords]?.say);
    return quoteOf((source?.text ?? one.opening).split('\n')[0] ?? one.opening);
}

function stateOf(one: Case, added: readonly Keyed[], dice: Dice): readonly DatasetRow[] {
    return SECTIONS.flatMap((section) => {
        const earlier = one.prior.filter(([mine]) => mine === section).map(([, text], position): DatasetRow => ({ key: `state/${TASK}/${section}/${position}`, section, text, fact: idOf(dice), born: false, anchor: quoteOf(text) }));
        const born = added.filter((entry) => entry.item.section === section).map((entry): DatasetRow => ({ key: entry.stateKey, section, text: entry.item.text, fact: '', born: true, anchor: anchorOf(one, entry.item) }));
        return [...earlier, ...born];
    });
}

function marksOf(one: Case, item: Planted, index: number): Readonly<Record<string, Mark>> {
    const own = `S-${item.section}`;
    const partner = one.items.some((other) => other.rewords === index);
    const open = new Set<string>([
        ...(item.open ?? []),
        ...(item.section === 'links' ? ['I1', 'I2', 'I5'] : []),
        ...(item.breach === 'I3' ? [own] : []),
        ...(partner ? ['I6'] : []),
    ]);
    const failed = item.breach === null ? null : item.breach === 'S' ? own : item.breach;
    return Object.fromEntries([...ITEM_CHECKS, own].map((check): [string, Mark] => [check, check === failed ? 'fail' : open.has(check) ? 'open' : 'pass']));
}

const REASONS: Readonly<Record<string, string>> = {
    I1: 'the item states several facts in one line',
    I2: 'the subject of the item is a pronoun or is left out, and only the transcript says what it is',
    I3: 'the item names no file, command, reference, value, version, error or role',
    I4: 'the input never says what the item says',
    I5: 'the subject of the item is the agent, not the work',
    I6: 'the item rewords another item added in the same run',
    I7: 'a later turn of the input says the opposite',
    S: 'the item does not meet the check of its own section',
};

function expectedOf(one: Case, added: readonly Keyed[]): unknown {
    const keyOf = new Map(added.map((entry) => [entry.index, entry.key]));
    return {
        items: added.map((entry) => {
            const { item, index } = entry;
            const partner = one.items.some((other) => other.rewords === index);
            return {
                key: entry.key,
                section: item.section,
                breach: item.breach === null ? null : item.breach === 'S' ? `S-${item.section}` : item.breach,
                checks: marksOf(one, item, index),
                why: item.breach === null ? (partner ? 'clean; another item rewords this one, so I6 is not scored here' : 'clean on every check') : REASONS[item.breach],
                support: item.breach === 'I4' ? null : (item.say?.text ?? (item.rewords === undefined ? null : one.items[item.rewords]?.say?.text ?? null)),
                contradiction: item.later?.text ?? null,
                rewords: item.rewords === undefined ? null : keyOf.get(item.rewords) ?? null,
                absent: item.absent ?? [],
            };
        }),
    };
}

function plantsOf(one: Case): readonly string[] {
    const breaches = one.items.flatMap((item) => (item.breach === null ? [] : [item.breach === 'S' ? `S-${item.section}` : item.breach]));
    const clean = one.items.filter((item, index) => item.breach === null && !one.items.some((other) => other.rewords === index)).length;
    return [...breaches, ...(clean > 0 ? ['clean'] : []), ...(one.items.some((item) => item.rewords !== undefined) ? ['clean-reworded'] : [])];
}

function itemOf(one: Case): { readonly line: string; readonly chars: number } {
    const dice = diceOf(one.n * 7919);
    const now = Date.UTC(2026, 8, 3 + one.n, 14, 30, 0);
    const request = requestOf(one, beatsOf(one, dice), now);
    const added = keyed(one);
    const state = stateOf(one, added, dice).map((item) => (item.fact === '' ? { ...item, fact: idOf(dice) } : item));
    const factOf = new Map(state.map((item) => [item.key, item.fact]));
    const items = added.map((entry): DatasetRow => ({ key: entry.key, section: entry.item.section, text: entry.item.text, fact: factOf.get(entry.stateKey) ?? '', born: true, anchor: anchorOf(one, entry.item) }));
    const chars = writerContext(request).length;
    const line = JSON.stringify({
        id: `ja-${two(one.n)}-${one.project}-${one.size}`,
        tags: [one.project, one.size, one.language, one.kind],
        plants: plantsOf(one),
        input: { request, items, state },
        expected: expectedOf(one, added),
    });
    return { line, chars };
}

const built = [...CASES_A, ...CASES_B].map(itemOf);
writeFileSync(new URL('./dataset.jsonl', import.meta.url), `${built.map((one) => one.line).join('\n')}\n`);
process.stdout.write(`${built.length} items, document chars ${built.map((one) => one.chars).join(' ')}\n`);
