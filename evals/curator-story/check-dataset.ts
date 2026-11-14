import { readFileSync } from 'node:fs';
import { CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-instructions.ts';
import { RUBRIC } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import { curatorInput } from '../../tab-recap/src/recap/application/curator-input.ts';
import type { CuratorMaterial } from '../../tab-recap/src/recap/application/curator-input.ts';
import { curationOf } from '../../tab-recap/src/recap/domain/curation.ts';
import { CLOSED_WHY, SECTION_IDS } from '../../tab-recap/src/recap/domain/fact.ts';
import { checkedTokens, outsideOf } from './tokens.ts';

interface Expected {
    readonly merge_pairs: readonly { readonly ids: readonly [string, string]; readonly kind: 'verbatim' | 'reworded'; readonly keep: string | null }[];
    readonly no_merge: readonly (readonly [string, string])[];
    readonly waiting_on_operator: { readonly ids: readonly string[]; readonly gist: string } | null;
    readonly closed_ids: readonly { readonly id: string; readonly closed_why: string; readonly must_not_say: string; readonly current: string | null }[];
    readonly names_and_numbers: readonly string[];
    readonly times: readonly string[];
}

interface Row {
    readonly id: string;
    readonly plants: readonly string[];
    readonly tags: readonly string[];
    readonly input: Omit<CuratorMaterial, 'rubric'>;
    readonly expected: Expected;
}

const problems: string[] = [];
const rows = readFileSync(new URL('./dataset.jsonl', import.meta.url), 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as Row);
const seen = new Set<string>();
const plantCount = new Map<string, number>();
const table: string[] = [];

for (const row of rows) {
    const bad = (what: string): void => { problems.push(`${row.id}: ${what}`); };
    if (seen.has(row.id)) bad('duplicate item id');
    seen.add(row.id);
    row.plants.forEach((plant) => plantCount.set(plant, (plantCount.get(plant) ?? 0) + 1));
    const { document, facts } = curatorInput({ ...row.input, rubric: RUBRIC.items });
    if (!document.startsWith('<curator_input') || !document.includes('<ledger>')) bad('the input builder gave no ledger document');
    if (facts.size !== row.input.facts.length) bad('the builder named a different number of facts');
    const ids = new Set<string>();
    row.input.facts.forEach((fact, index) => {
        const previous = row.input.facts[index - 1];
        if (ids.has(fact.id)) bad(`duplicate fact id ${fact.id}`);
        ids.add(fact.id);
        if (!/^fact_[0-9a-z]{26}$/.test(fact.id)) bad(`fact id form ${fact.id}`);
        if (!SECTION_IDS.includes(fact.section)) bad(`section ${fact.section}`);
        if (fact.text.trim() === '') bad('empty text');
        if (fact.lastAt < fact.firstAt || fact.lastAt > row.input.clock.now) bad(`times of ${fact.id}`);
        if ((fact.state === 'closed') !== (fact.closedAt !== null) || (fact.state === 'closed') !== (fact.closedWhy !== null)) bad(`closed fields of ${fact.id}`);
        if (fact.closedWhy !== null && !CLOSED_WHY.includes(fact.closedWhy)) bad(`closed why of ${fact.id}`);
        if (fact.closedAt !== null && fact.closedAt < fact.lastAt) bad(`closed before last change: ${fact.id}`);
        if (fact.section === 'decisions' && fact.why === null) bad(`decision without a reason: ${fact.id}`);
        if (previous !== undefined && (previous.firstAt > fact.firstAt || (previous.firstAt === fact.firstAt && previous.id >= fact.id))) bad(`order at ${fact.id}`);
        for (const text of [fact.text, fact.why ?? '', fact.ref ?? '']) {
            for (const host of text.match(/[a-z0-9.-]+\.[a-z]{2,}(?=\/|$|\s)/g) ?? []) {
                if (/^https?:/.test(text) && !host.endsWith('.test') && text.includes(`//${host}`)) bad(`host outside .test: ${host}`);
            }
        }
    });
    const get = (id: string) => facts.get(id);
    const open = new Set([...facts].filter(([, fact]) => fact.state === 'open').map(([id]) => id));
    const planted = new Set<string>();
    for (const pair of row.expected.merge_pairs) {
        const [first, second] = [get(pair.ids[0]), get(pair.ids[1])];
        if (first === undefined || second === undefined || !open.has(pair.ids[0]) || !open.has(pair.ids[1])) { bad(`merge pair ${pair.ids.join('+')} is not two open facts`); continue; }
        planted.add([...pair.ids].sort().join('+'));
        if (first.section !== second.section) bad(`merge pair ${pair.ids.join('+')} crosses sections`);
        if (pair.kind === 'verbatim' && (first.text !== second.text || first.why !== second.why || pair.keep !== null)) bad(`verbatim pair ${pair.ids.join('+')} is not a copy`);
        if (pair.kind === 'reworded' && (first.text === second.text || pair.keep === null || !pair.ids.includes(pair.keep))) bad(`reworded pair ${pair.ids.join('+')}`);
    }
    for (const pair of row.expected.no_merge) {
        const [first, second] = [get(pair[0]), get(pair[1])];
        if (first === undefined || second === undefined || !open.has(pair[0]) || !open.has(pair[1]) || first.text === second.text) bad(`near pair ${pair.join('+')}`);
    }
    const texts = new Map<string, string>();
    for (const id of open) {
        const text = get(id)?.text ?? '';
        const other = texts.get(text);
        if (other !== undefined && !planted.has([other, id].sort().join('+'))) bad(`unplanted identical open facts ${other}+${id}`);
        texts.set(text, id);
    }
    const needs = [...open].filter((id) => get(id)?.section === 'needs').sort();
    const waiting = [...(row.expected.waiting_on_operator?.ids ?? [])].sort();
    if (needs.join(',') !== waiting.join(',')) bad(`open needs ${needs.join(',')} against waiting_on_operator ${waiting.join(',')}`);
    if (row.expected.waiting_on_operator !== null && row.expected.waiting_on_operator.gist.trim() === '') bad('waiting gist empty');
    for (const closed of row.expected.closed_ids) {
        const fact = get(closed.id);
        if (fact === undefined || fact.state !== 'closed' || fact.closedWhy !== closed.closed_why || !['wrong', 'superseded', 'answered'].includes(closed.closed_why)) bad(`closed id ${closed.id}`);
        if (closed.current !== null && !open.has(closed.current)) bad(`current fact ${closed.current} of ${closed.id} is not open`);
    }
    const allowed = { names: row.expected.names_and_numbers, times: row.expected.times, facts: facts.size };
    const ledgerText = row.input.facts.map((fact) => `${fact.text} ${fact.why ?? ''} ${fact.ref ?? ''}`).join(' ');
    const outside = outsideOf(allowed, `${row.input.name} ${ledgerText}`);
    if (outside.length > 0) bad(`ledger tokens outside names_and_numbers: ${outside.join(' ')}`);
    const shown = [...document.matchAll(/(?:first|last|closedat|now)="([^"]+)"/g)].map((match) => match[1] ?? '');
    const unknownTimes = shown.filter((time) => outsideOf(allowed, time).length > 0);
    if (unknownTimes.length > 0) bad(`times of the document outside expected.times: ${unknownTimes.slice(0, 3).join(', ')}`);
    const invented = outsideOf(allowed, `In f${facts.size + 1} the build zz-invented-9731 ran on qx.example.dev at 25:61 with fakeName and 987654 rows, see f1.`);
    if (invented.join(' ') !== ['25:61', '987654', 'fakename', `f${facts.size + 1}`, 'qx.example.dev', 'zz-invented-9731'].sort().join(' ')) bad(`the token check gave ${invented.join(' ')}`);
    const ops = row.expected.merge_pairs.map((pair) => ({ op: 'close', id: pair.keep === null ? pair.ids[1] : pair.ids.find((id) => id !== pair.keep), why: 'merged', into: pair.keep ?? pair.ids[0] }));
    const perfect = curationOf(JSON.stringify({ ops, story: 'A story.' }), open);
    if (perfect.refused.length > 0 || perfect.merges.length !== ops.length || perfect.story === null) bad(`the expected merges are refused by curationOf: ${perfect.refused.join('; ')}`);
    const closedOne = [...facts].find(([, fact]) => fact.state === 'closed')?.[0];
    if (closedOne !== undefined && curationOf(JSON.stringify({ ops: [{ op: 'close', id: closedOne, why: 'merged', into: [...open][0] }], story: 'A story.' }), open).refused.length !== 1) bad('curationOf accepted a merge of a closed fact');
    const promptBytes = Buffer.byteLength(document) + Buffer.byteLength(CURATOR_INSTRUCTIONS);
    table.push([row.id, row.input.language, facts.size, open.size, facts.size - open.size, promptBytes, row.expected.merge_pairs.length, row.expected.no_merge.length, row.expected.waiting_on_operator === null ? 0 : 1, row.expected.closed_ids.length, checkedTokens(ledgerText).length].join('\t'));
}

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')) as { readonly items: number; readonly plants: Readonly<Record<string, number>>; readonly sizes: Readonly<Record<string, number>> };
if (config.items !== rows.length) problems.push(`config.json says ${config.items} items, the dataset has ${rows.length}`);
for (const [plant, count] of Object.entries(config.plants)) {
    if (plantCount.get(plant) !== count) problems.push(`config.json says ${count} items plant ${plant}, the dataset has ${plantCount.get(plant) ?? 0}`);
}
for (const [size, count] of Object.entries(config.sizes)) {
    const found = rows.filter((row) => row.tags.includes(size)).length;
    if (found !== count) problems.push(`config.json says ${count} ${size} items, the dataset has ${found}`);
}

console.log(['id', 'lang', 'facts', 'open', 'closed', 'prompt_bytes', 'merge', 'near', 'waiting', 'closed_plants', 'ledger_tokens'].join('\t'));
console.log(table.join('\n'));
console.log(`items ${rows.length}; plants ${[...plantCount].map(([plant, count]) => `${plant} ${count}`).join(', ')}`);
if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
}
console.log('all checks passed');
