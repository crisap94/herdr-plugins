import { CONFIGS, SMOKE_ITEMS, loadItems, specOf } from './spec.ts';
import { idsFor, prompt } from './prompt.ts';
import { CLASSES, CODE_CRITERIA, expectedOf, grade } from './scoring.ts';

const problems: string[] = [];
const bad = (what: string): void => { problems.push(what); };
const items = loadItems();
const spec = specOf(items);

const answer = (values: Record<string, number>, fenced: boolean): string => (fenced ? `\`\`\`json\n${JSON.stringify(values)}\n\`\`\`` : JSON.stringify(values));

const counts: Record<string, { questions: number; items: number }> = {};
let questions = 0;
for (const item of items) {
    const ids = idsFor(item);
    questions += ids.length;
    const built = prompt(item);
    for (const question of ids) if (!built.system.includes(`- ${question}: `)) bad(`${item.id}: system prompt lacks ${question}`);
    if (!built.user.startsWith('{"brief":')) bad(`${item.id}: user text is not the covered() state`);
    for (const each of CLASSES) {
        const asked = ids.filter((question) => each.holds(question, expectedOf(item, question)));
        const count = counts[each.id] ?? { questions: 0, items: 0 };
        counts[each.id] = { questions: count.questions + asked.length, items: count.items + (asked.length > 0 ? 1 : 0) };
    }
    const perfect = Object.fromEntries(ids.map((question) => [question, expectedOf(item, question).kept ? 0.95 : 0.05]));
    const edge = Object.fromEntries(ids.map((question) => [question, expectedOf(item, question).kept ? 0.7 : 0.69]));
    const inverted = Object.fromEntries(ids.map((question) => [question, expectedOf(item, question).kept ? 0.05 : 0.95]));
    for (const [name, values, fenced] of [['perfect', perfect, false], ['perfect fenced', perfect, true], ['at the mark', edge, false]] as const) {
        const graded = grade(item, answer(values, fenced));
        if (!graded.parsed) bad(`${item.id}: ${name} answer not parsed`);
        for (const criterion of CODE_CRITERIA) if (graded.marks[criterion] === false) bad(`${item.id}: ${name} answer fails ${criterion}`);
        if (graded.marks.C8a !== (item.expected.ok ? null : true) || graded.marks.C8b !== (item.expected.ok ? true : null)) bad(`${item.id}: ${name} C8a/C8b applicability`);
    }
    const wrong = grade(item, answer(inverted, false));
    if (wrong.marks.C1 !== true) bad(`${item.id}: inverted answer fails C1`);
    for (const criterion of CODE_CRITERIA.filter((id) => id !== 'C1' && id !== 'C8' && id !== 'C8a' && id !== 'C8b')) if (wrong.marks[criterion] === true) bad(`${item.id}: inverted answer passes ${criterion}`);
    const missingOne = Object.fromEntries(ids.slice(1).map((question) => [question, 0.5]));
    const refused = grade(item, answer(missingOne, false));
    if (refused.parsed || refused.marks.C1 !== false) bad(`${item.id}: an answer without ${ids[0]} is not refused`);
    for (const criterion of CODE_CRITERIA) if (refused.marks[criterion] === true) bad(`${item.id}: refused answer passes ${criterion}`);
    if (grade(item, 'I cannot tell.').parsed) bad(`${item.id}: prose answer parsed`);
    const outOfRange = grade(item, answer({ ...perfect, [ids[0] ?? '']: 1.2 }, false));
    if (outOfRange.parsed) bad(`${item.id}: probability 1.2 parsed`);
    for (const config of CONFIGS) {
        for (const repetition of [1, 2, 3]) {
            const text = spec.stub(item, config, repetition);
            if (text !== spec.stub(item, config, repetition)) bad(`${item.id}: stub not deterministic`);
        }
    }
}

const want: Record<string, readonly [number, number]> = { C2: [31, 5], C3: [50, 4], C4: [254, 21], C4p: [223, 18], C5: [107, 15], C5a: [42, 8], C5n: [15, 6], C6: [83, 24], C6d: [8, 4] };
for (const [id, [q, n]] of Object.entries(want)) {
    const got = counts[id];
    if (got?.questions !== q || got.items !== n) bad(`${id}: ${got?.questions ?? 0} questions in ${got?.items ?? 0} items, SPEC says ${q} in ${n}`);
}
if (questions !== 444) bad(`${questions} questions, SPEC says 444`);
if (items.filter((item) => item.expected.ok).length !== 9) bad('SPEC says 9 passing briefs');
if (CONFIGS.length !== 6 || CONFIGS[0]?.name !== 'claude-haiku-low' || CONFIGS[0]?.shipped !== true || CONFIGS.some((config) => config.timeoutMs !== 180000)) bad('configurations differ from SPEC section 4');
if (SMOKE_ITEMS.length * CONFIGS.length !== 12) bad('smoke is not 12 calls');

if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`${problems.length} problems`);
    process.exit(1);
}
console.log(`coverage-check scoring: ${items.length} items, ${questions} questions, ${CONFIGS.length} configurations, all checks pass`);
