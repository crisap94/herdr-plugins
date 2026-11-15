import { readFileSync } from 'node:fs';
import { judgeInstructions } from '../../tab-recap/src/adapters/job/prompts/judge-instructions.ts';
import { RUBRIC_TEXT } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import { parseScore } from '../../tab-recap/src/recap/application/judge-answer.ts';
import { scoringDocument } from '../../tab-recap/src/recap/application/judge-context.ts';
import { writerContext } from '../../tab-recap/src/recap/application/writer-context.ts';
import type { RecapRequest } from '../../tab-recap/src/ports/summarizer.ts';
import type { RunItem } from '../../tab-recap/src/ports/run-inputs.ts';

type Mark = 'pass' | 'fail' | 'open';

interface Expected {
    readonly key: string;
    readonly section: string;
    readonly breach: string | null;
    readonly checks: Readonly<Record<string, Mark>>;
    readonly why: string;
    readonly support: string | null;
    readonly contradiction: string | null;
    readonly rewords: string | null;
    readonly absent: readonly string[];
}

interface Line {
    readonly id: string;
    readonly tags: readonly string[];
    readonly plants: readonly string[];
    readonly input: { readonly request: RecapRequest; readonly items: readonly RunItem[]; readonly state: readonly RunItem[] };
    readonly expected: { readonly items: readonly Expected[] };
}

const ITEM_CHECKS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'];
const problems: string[] = [];
const fails = new Map<string, number>();
const passes = new Map<string, number>();
const opens = new Map<string, number>();
const sections = new Map<string, number>();
const sizes: string[] = [];
let added = 0;
let breached = 0;
let clean = 0;
let partners = 0;

const bump = (counts: Map<string, number>, name: string): void => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
};

const pooled = (check: string): string => (check.startsWith('S-') ? 'S' : check);

const lines = readFileSync(new URL('./dataset.jsonl', import.meta.url), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Line);
const ids = new Set(lines.map((line) => line.id));
if (ids.size !== lines.length) {
    problems.push('item ids are not unique');
}

for (const line of lines) {
    const say = (what: string): void => {
        problems.push(`${line.id}: ${what}`);
    };
    const document = writerContext(line.input.request);
    const scoring = scoringDocument({ rubric: RUBRIC_TEXT, input: document, items: line.input.items, state: line.input.state });
    const instructions = judgeInstructions('score', new Map());
    sizes.push(`${line.id} writer_input=${document.length} judge_input=${scoring.length} instructions=${instructions.length}`);
    if (!scoring.startsWith('<judge_input version="1">') || !scoring.includes('<writer_input>') || instructions.length === 0) {
        say('the scoring document or the instructions were not built');
    }
    if (document.includes(' omitted="') || document.includes('clipped="')) {
        say('the writer input dropped or clipped a turn');
    }
    const keys = new Set(line.input.items.map((item) => item.key));
    const stateKeys = new Set(line.input.state.map((item) => item.key));
    if (keys.size !== line.input.items.length || stateKeys.size !== line.input.state.length) {
        say('item keys are not unique');
    }
    if (line.input.items.length !== 8 || line.expected.items.length !== 8) {
        say('not 8 added items');
    }
    for (const item of line.input.items) {
        const [task, section, position] = item.key.split('/');
        if (!/^t\d+\/[a-z]+\/\d+$/.test(item.key) || section !== item.section || task === undefined || position === undefined) {
            say(`bad key ${item.key}`);
        }
        if (!line.input.state.some((other) => other.fact === item.fact && other.text === item.text && other.born)) {
            say(`added item ${item.key} is not in the state`);
        }
        if (!/^fct_[0-9a-z]{26}$/.test(item.fact)) {
            say(`bad fact id on ${item.key}`);
        }
        if (item.anchor === null || !document.includes(item.anchor)) {
            say(`anchor of ${item.key} is not in the input`);
        }
    }
    for (const expected of line.expected.items) {
        const item = line.input.items.find((one) => one.key === expected.key);
        if (item === undefined) {
            say(`expected key ${expected.key} is not an added item`);
            continue;
        }
        added += 1;
        bump(sections, item.section);
        const names = Object.keys(expected.checks);
        const wanted = [...ITEM_CHECKS, `S-${item.section}`];
        if (names.length !== 8 || wanted.some((check) => !names.includes(check))) {
            say(`${expected.key} does not carry its 8 checks`);
        }
        const failed = names.filter((check) => expected.checks[check] === 'fail');
        if (expected.breach === null ? failed.length !== 0 : failed.length !== 1 || failed[0] !== expected.breach) {
            say(`${expected.key} does not fail exactly its planted check`);
        }
        for (const check of names) {
            bump(expected.checks[check] === 'fail' ? fails : expected.checks[check] === 'pass' ? passes : opens, pooled(check));
        }
        breached += expected.breach === null ? 0 : 1;
        const reworded = line.expected.items.some((other) => other.rewords === expected.key);
        clean += expected.breach === null && !reworded ? 1 : 0;
        partners += expected.breach === null && reworded ? 1 : 0;
        if (expected.support !== null && !document.includes(expected.support)) {
            say(`support of ${expected.key} is not in the input`);
        }
        if (expected.breach !== 'I4' && expected.support === null) {
            say(`${expected.key} has no support`);
        }
        if (expected.breach === 'I4' && (expected.absent.length === 0 || expected.absent.some((token) => document.includes(token)))) {
            say(`${expected.key} is an unsupported item whose absent words are in the input`);
        }
        if ((expected.breach === 'I7') !== (expected.contradiction !== null)) {
            say(`${expected.key}: a contradiction goes with I7 and only with it`);
        }
        if (expected.contradiction !== null && expected.support !== null && document.indexOf(expected.contradiction) <= document.indexOf(expected.support)) {
            say(`contradiction of ${expected.key} is missing or not after its support`);
        }
        if ((expected.breach === 'I6') !== (expected.rewords !== null) || (expected.rewords !== null && !keys.has(expected.rewords))) {
            say(`${expected.key}: rewords goes with I6 and names an added item`);
        }
        if (expected.breach !== 'I4') {
            for (const token of item.text.match(/`[^`]+`/g) ?? []) {
                if (!document.includes(token.slice(1, -1))) {
                    say(`${expected.key} names ${token}, which is not in the input`);
                }
            }
        }
    }
    const perfect = JSON.stringify({
        verdicts: line.expected.items.flatMap((expected) => Object.entries(expected.checks).map(([check, mark]) => ({ item: expected.key, check, pass: mark !== 'fail', critique: mark === 'fail' ? expected.why : '' }))),
        keyfacts: ['a key fact'],
        coverage: [{ keyfact: 0, item: line.input.state[0]?.key ?? null }],
    });
    const parsed = parseScore(perfect, new Map(line.input.items.map((item) => [item.key, item.section])), new Map(line.input.state.map((item) => [item.key, item.section])));
    if (parsed.kind !== 'ok' || parsed.value.verdicts.length !== 64) {
        say('the plugin parser does not accept the expected answer in full');
    }
    for (const host of JSON.stringify(line).match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|local|internal|test)\b/g) ?? []) {
        if (!host.endsWith('.test')) {
            say(`host ${host} is not under .test`);
        }
    }
}

const table = (counts: Map<string, number>): string => [...ITEM_CHECKS, 'S'].map((check) => `${check}=${counts.get(check) ?? 0}`).join(' ');
process.stdout.write(`${sizes.join('\n')}\n`);
process.stdout.write(`items ${lines.length}, added ${added}, breached ${breached}, clean ${clean}, clean with a rewording next to it ${partners}\n`);
process.stdout.write(`must fail: ${table(fails)}\nmust pass: ${table(passes)}\nopen:      ${table(opens)}\n`);
process.stdout.write(`sections: ${[...sections].map(([name, count]) => `${name}=${count}`).join(' ')}\n`);
if ([...ITEM_CHECKS, 'S'].some((check) => fails.get(check) !== 20) || added !== 192 || breached !== 160) {
    problems.push('the planted counts are not 20 per check, 160 breached of 192');
}
process.stdout.write(problems.length === 0 ? 'OK\n' : `${problems.join('\n')}\nFAILED ${problems.length}\n`);
process.exit(problems.length === 0 ? 0 : 1);
