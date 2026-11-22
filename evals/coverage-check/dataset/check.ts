import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deciderInstructions, probabilitiesOf } from '../../../tab-recap/src/adapters/job/decider.ts';
import { FACTS_CHECKED, KEPT_AT_LEAST, checkedFactsOf, questionsOf } from '../../../tab-recap/src/recap/application/brief-coverage.ts';
import { unmetBy } from '../prompt.ts';
import { isSection } from '../../../packages/session-ledger/src/recap/domain/fact.ts';
import { BANK, INTRO, SETTLED } from './bank.ts';
import { textOf } from '../../../packages/session-ledger/src/recap/domain/text.ts';


const problems: string[] = [];
const bad = (what: string): void => { problems.push(what); };

for (const fact of BANK) {
    for (const key of fact.keys) {
        if (!fact.text.includes(key)) bad(`bank ${fact.id}: key "${key}" not in text`);
        if (!fact.para.includes(key)) bad(`bank ${fact.id}: key "${key}" not in paraphrase`);
        if (fact.vague?.includes(key)) bad(`bank ${fact.id}: vague form holds key "${key}"`);
        for (const other of BANK) {
            if (other === fact) continue;
            for (const text of [other.text, other.para, other.vague, other.wrong, other.why, other.reason]) if (text?.includes(key)) bad(`bank ${fact.id}: key "${key}" also in ${other.id}`);
        }
        for (const intro of Object.values(INTRO)) if (intro.includes(key)) bad(`bank ${fact.id}: key "${key}" in an intro`);
        for (const rows of Object.values(SETTLED)) for (const row of rows) if (row[1].includes(key) || row[3]?.includes(key)) bad(`bank ${fact.id}: key "${key}" in a settled fact`);
        if (fact.why?.includes(key) || fact.reason?.includes(key)) bad(`bank ${fact.id}: key "${key}" in its own reason`);
    }
    if (fact.keys.length === 0) bad(`bank ${fact.id}: no key`);
    if (fact.para.includes(fact.text)) bad(`bank ${fact.id}: paraphrase holds the text word for word`);
    if (fact.wrong !== null && fact.keys.every((key) => fact.wrong!.includes(key))) bad(`bank ${fact.id}: changed form keeps every key`);
    if (fact.section === 'decisions' && (fact.why === null || fact.reason === null || fact.whyKeys.length === 0)) bad(`bank ${fact.id}: decision without reason parts`);
    for (const key of fact.whyKeys) {
        if (!fact.why!.includes(key)) bad(`bank ${fact.id}: why key "${key}" not in why`);
        if (!fact.reason!.includes(key)) bad(`bank ${fact.id}: why key "${key}" not in reason`);
        if (fact.text.includes(key) || fact.para.includes(key)) bad(`bank ${fact.id}: why key "${key}" in the decision itself`);
        for (const other of BANK) {
            if (other === fact) continue;
            for (const text of [other.text, other.para, other.vague, other.wrong, other.why, other.reason]) if (text?.includes(key)) bad(`bank ${fact.id}: why key "${key}" also in ${other.id}`);
        }
    }
    if (fact.reason !== null && fact.why !== null && fact.reason.includes(fact.why)) bad(`bank ${fact.id}: reason holds why word for word`);
}

const bank = new Map(BANK.map((fact) => [fact.id, fact]));
const path = process.argv[2] ?? join(import.meta.dirname, '..', 'dataset.jsonl');
const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line !== '');
const ids = new Set<string>();
const tally: Record<string, number> = {};
const rows: string[] = [];
let questionsTotal = 0;

for (const [at, line] of lines.entries()) {
    let item: any;
    try { item = JSON.parse(line); } catch { bad(`line ${at + 1}: not JSON`); continue; }
    const id: string = item.id;
    if (typeof id !== 'string' || id === '') { bad(`line ${at + 1}: no id`); continue; }
    if (ids.has(id)) bad(`${id}: duplicate id`);
    ids.add(id);
    if (!Array.isArray(item.plants) || item.plants.length === 0 || !Array.isArray(item.tags)) bad(`${id}: plants or tags missing`);
    const { brief, history } = item.input ?? {};
    if (typeof brief !== 'string' || brief.trim() === '' || !Array.isArray(history)) { bad(`${id}: input is not {brief, history}`); continue; }
    if (Object.keys(item.input).sort().join() !== 'brief,history') bad(`${id}: input has other fields`);
    if (brief.includes('\n')) bad(`${id}: brief has a line break`);
    for (const [index, fact] of history.entries()) {
        const keys = Object.keys(fact).sort().join();
        if (keys !== 'closedAt,closedWhy,firstAt,lastAt,section,state,text,why') bad(`${id}: history[${index}] fields are ${keys}`);
        if (!isSection(fact.section)) bad(`${id}: history[${index}] section ${fact.section}`);
        if (typeof fact.text !== 'string' || fact.text === '') bad(`${id}: history[${index}] text`);
        if (!(fact.why === null || typeof fact.why === 'string')) bad(`${id}: history[${index}] why`);
        if (fact.state !== 'open' && fact.state !== 'closed') bad(`${id}: history[${index}] state`);
        if ((fact.state === 'closed') !== (fact.closedWhy !== null) || (fact.state === 'closed') !== (fact.closedAt !== null)) bad(`${id}: history[${index}] closed fields disagree with state`);
        if (!Number.isInteger(fact.firstAt) || !Number.isInteger(fact.lastAt) || fact.lastAt < fact.firstAt) bad(`${id}: history[${index}] times`);
    }
    const facts = checkedFactsOf(history);
    if (facts.length === 0 || facts.length > FACTS_CHECKED) bad(`${id}: ${facts.length} facts asked`);
    const questions = questionsOf(facts);
    const asked = Object.keys(questions);
    const expected = item.expected;
    if (expected.facts_asked !== facts.length) bad(`${id}: facts_asked ${expected.facts_asked} but the builder gives ${facts.length}`);
    if (expected.pass_mark !== KEPT_AT_LEAST) bad(`${id}: pass mark differs from the plugin's`);
    const want = Object.keys(expected.questions);
    if (want.join() !== asked.join()) bad(`${id}: expected question ids differ from questionsFor`);
    const system = deciderInstructions(questions);
    const user = JSON.stringify({ brief, facts: facts.map((fact) => ({ section: fact.section, text: fact.text, why: fact.why })) });
    for (const q of asked) if (!system.includes(`- ${q}: `)) bad(`${id}: instructions lack ${q}`);
    const perfect = Object.fromEntries(asked.map((q) => [q, expected.questions[q]?.kept ? 1 : 0]));
    const parsed = probabilitiesOf(textOf(`\`\`\`json\n${JSON.stringify(perfect)}\n\`\`\``), asked.map((id) => textOf(id)));
    if (parsed === null) { bad(`${id}: the plugin's parser refuses a perfect answer`); continue; }
    const missing = unmetBy(Object.fromEntries(parsed), facts).map(({ index, parts }) => ({ index, parts }));
    if (JSON.stringify(missing) !== JSON.stringify(expected.missing)) bad(`${id}: expected.missing differs from missingOf on a perfect answer`);
    if (expected.ok !== (missing.length === 0)) bad(`${id}: expected.ok disagrees`);
    for (const miss of expected.missing) if (facts[miss.index] === undefined) bad(`${id}: missing index ${miss.index} out of range`);
    for (const q of want) {
        const entry = expected.questions[q];
        const index = Number(q.split('_')[1]);
        const fact = facts[index];
        const source = bank.get(entry.fact);
        if (fact === undefined || source === undefined) { bad(`${id}: ${q} points at nothing`); continue; }
        if (source.text !== fact.text || source.why !== fact.why || source.section !== fact.section) bad(`${id}: ${q} fact ${entry.fact} is not facts[${index}]`);
        const has = (text: string): boolean => brief.includes(text);
        const none = (keys: string[]): boolean => keys.every((key) => !has(key));
        const every = (keys: string[]): boolean => keys.every(has);
        tally[entry.how] = (tally[entry.how] ?? 0) + 1;
        questionsTotal += 1;
        const reasonQuestion = q.startsWith('reason_');
        const wantKept = ['literal', 'paraphrase', 'reason-literal', 'reason-paraphrase'].includes(entry.how);
        if (entry.kept !== wantKept) bad(`${id}: ${q} kept=${entry.kept} with how=${entry.how}`);
        switch (entry.how) {
            case 'literal': if (!has(source.text)) bad(`${id}: ${q} literal text not in brief`); break;
            case 'paraphrase': if (!every(source.keys) || has(source.text) || !has(source.para)) bad(`${id}: ${q} paraphrase not as planned`); break;
            case 'absent': case 'foreign': if (!none(source.keys) || !none(source.whyKeys) || has(source.text)) bad(`${id}: ${q} ${entry.how} fact shows in brief`); break;
            case 'vague': if (!none(source.keys) || !has(source.vague!)) bad(`${id}: ${q} vague not as planned`); break;
            case 'detail-changed': if (every(source.keys) || !has(source.wrong!)) bad(`${id}: ${q} changed detail not as planned`); break;
            case 'reason-literal': if (!reasonQuestion || !has(source.why!)) bad(`${id}: ${q} literal reason not in brief`); break;
            case 'reason-paraphrase': if (!reasonQuestion || !every(source.whyKeys) || has(source.why!) || !has(source.reason!)) bad(`${id}: ${q} reason paraphrase not as planned`); break;
            case 'reason-dropped': if (!reasonQuestion || !none(source.whyKeys) || has(source.why!) || !expected.questions[`keeps_${index}`].kept) bad(`${id}: ${q} dropped reason not as planned`); break;
            default: bad(`${id}: ${q} unknown how ${entry.how}`);
        }
    }
    for (const gone of expected.not_asked) if (!bank.has(gone)) bad(`${id}: not_asked ${gone} unknown`);
    const text = JSON.stringify(item);
    if (/\/home\/|\/Users\/|crisap|herdr|tab-recap|homelab/i.test(text)) bad(`${id}: holds a real name or path`);
    for (const host of text.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|dev|app|cloud)\b/g) ?? []) bad(`${id}: host ${host} is not under .test`);
    const size = item.tags.find((tag: string) => tag.startsWith('size:'));
    rows.push([id, size, `brief ${brief.length} ch`, `history ${history.length}`, `facts ${facts.length}`, `questions ${asked.length}`, `not kept ${want.filter((q) => !expected.questions[q].kept).length}`, `ok ${expected.ok}`, `prompt ${system.length + user.length} ch`].join(' | '));
}

console.log(rows.join('\n'));
console.log(`items ${lines.length}, questions ${questionsTotal}, by how ${JSON.stringify(tally)}`);
console.log(`bank facts ${BANK.length}`);
if (problems.length > 0) { console.log(`PROBLEMS ${problems.length}\n${problems.join('\n')}`); process.exit(1); }
console.log('all checks pass');
