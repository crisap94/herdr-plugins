import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autocompactState, OPEN_WORK_SHOWN, TURNS_SHOWN, type DeciderState } from '../../tab-recap/src/recap/application/autocompact-state.ts';
import { QUESTIONS } from '../../tab-recap/src/recap/application/autocompact-questions.ts';
import { deciderInstructions, probabilitiesOf } from '../../tab-recap/src/adapters/job/decider.ts';
import { verdictOf } from '../../tab-recap/src/recap/domain/autocompact-verdict.ts';
import { SECTION_IDS, CLOSED_WHY } from '../../packages/session-ledger/src/recap/domain/fact.ts';
import type { Entry } from '../../packages/session-ledger/src/ports/transcripts.ts';
import type { HistoryFact } from '../../packages/session-ledger/src/ports/ledger.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';

interface Evidence { readonly question: string; readonly field: keyof DeciderState; readonly quote: string }
interface Row {
    readonly id: string;
    readonly plants: readonly string[];
    readonly tags: readonly string[];
    readonly input: { readonly recent: readonly Entry[]; readonly history: readonly HistoryFact[] };
    readonly expected: { readonly answers: Readonly<Record<string, string>>; readonly verdict: string; readonly evidence: readonly Evidence[]; readonly note: string };
}

const config = JSON.parse(readFileSync(join(import.meta.dirname, 'config.json'), 'utf8')) as { readonly dataset: string; readonly plants: Readonly<Record<string, number>>; readonly secondaryPlants: readonly string[]; readonly questions: readonly string[] };
const rows = readFileSync(join(import.meta.dirname, config.dataset), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Row);
const ids = Object.keys(QUESTIONS);
const problems: string[] = [];
const fail = (id: string, what: string): void => { problems.push(`${id}: ${what}`); };
const ROLES = ['user', 'agent', 'tool'];
const KINDS = ['shell', 'edit', 'web', 'agent', 'other', 'read'];
const SIDES = ['true', 'false', 'open'];
const REAL = /\/home\/|\/Users\/|crisap|herdr|tab-recap|homelab|cadre|\b[\w-]+\.(com|io|net|org|dev|ai|app)\b/i;
const instructions = deciderInstructions(QUESTIONS);

const fieldText = (state: DeciderState, field: keyof DeciderState): string => {
    const value = state[field];
    return value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value.map((part) => part.text)).replaceAll('\\n', '\n').replaceAll('\\"', '"');
};

const assignments = (answers: Readonly<Record<string, string>>): Record<string, number>[] => {
    let made: Record<string, number>[] = [{}];
    for (const id of ids) {
        const side = answers[id];
        const values = side === 'true' ? [1] : side === 'false' ? [0] : [0, 1];
        made = made.flatMap((partial) => values.map((value) => ({ ...partial, [id]: value })));
    }
    return made;
};

if (JSON.stringify([...config.questions].sort()) !== JSON.stringify([...ids].sort())) fail('config', 'questions differ from the plugin QUESTIONS');
if (new Set(rows.map((row) => row.id)).size !== rows.length) fail('dataset', 'ids are not unique');

const table: string[] = [];
const plantCount = new Map<string, number>();
const sideCount = new Map<string, number>();
for (const row of rows) {
    const { id } = row;
    if (!/^md-\d\d-[a-z0-9-]+$/.test(id)) fail(id, 'id format');
    if (row.plants.length === 0) fail(id, 'no plant');
    for (const plant of row.plants) {
        if (!(plant in config.plants) && !config.secondaryPlants.includes(plant)) fail(id, `unknown plant ${plant}`);
        plantCount.set(plant, (plantCount.get(plant) ?? 0) + 1);
    }
    for (const entry of row.input.recent) {
        if (!ROLES.includes(entry.role)) fail(id, `role ${entry.role}`);
        if (typeof entry.text !== 'string') fail(id, 'entry text');
        if (entry.role === 'tool' && !KINDS.includes(entry.kind ?? '')) fail(id, 'tool kind');
        if (entry.role !== 'tool' && (entry.kind !== undefined || entry.text === '')) fail(id, 'non-tool entry with a kind or empty text');
        if (typeof entry.at !== 'number') fail(id, 'entry at');
    }
    if (row.input.recent.some((entry, index, all) => index > 0 && (entry.at ?? 0) < ((all[index - 1] as Entry).at ?? 0))) fail(id, 'entries out of time order');
    for (const fact of row.input.history) {
        if (!SECTION_IDS.some((section) => section === fact.section)) fail(id, `section ${fact.section}`);
        if (fact.text === '') fail(id, 'empty fact');
        if ((fact.state === 'closed') !== (fact.closedAt !== null) || (fact.state === 'closed') !== (fact.closedWhy !== null)) fail(id, 'closed fields');
        if (fact.closedWhy !== null && !CLOSED_WHY.some((why) => why === fact.closedWhy)) fail(id, `closedWhy ${fact.closedWhy}`);
        if (fact.section === 'decisions' && fact.why === null) fail(id, 'decision without why');
        if (fact.lastAt < fact.firstAt) fail(id, 'fact times');
    }
    if (REAL.test(JSON.stringify(row.input))) fail(id, `real-looking name or domain: ${REAL.exec(JSON.stringify(row.input))?.[0]}`);
    const state = autocompactState(row.input.recent, row.input.history);
    const document = JSON.stringify(state);
    if (state.last_prompt === null || state.last_reply === null) fail(id, 'no prompt or reply');
    if (state.recent_turns.length > TURNS_SHOWN || state.open_work.length > OPEN_WORK_SHOWN) fail(id, 'state limits');
    if (JSON.stringify(Object.keys(row.expected.answers).sort()) !== JSON.stringify([...ids].sort())) fail(id, 'expected answers do not cover the six questions');
    for (const side of Object.values(row.expected.answers)) {
        if (!SIDES.includes(side)) fail(id, `side ${side}`);
        sideCount.set(side, (sideCount.get(side) ?? 0) + 1);
    }
    for (const questionId of ids) sideCount.set(`${questionId}=${row.expected.answers[questionId]}`, (sideCount.get(`${questionId}=${row.expected.answers[questionId]}`) ?? 0) + 1);
    const verdicts = new Set(assignments(row.expected.answers).map((answers) => verdictOf(answers)));
    if (verdicts.size !== 1 || !verdicts.has(row.expected.verdict as 'compact' | 'wait')) fail(id, `verdict ${row.expected.verdict} is not what verdictOf gives: ${[...verdicts].join(',')}`);
    if (!row.tags.includes(`verdict:${row.expected.verdict}`)) fail(id, 'verdict tag');
    for (const question of ids.filter((questionId) => row.expected.answers[questionId] === 'true')) {
        if (!row.expected.evidence.some((evidence) => evidence.question === question)) fail(id, `no evidence for true answer ${question}`);
    }
    for (const evidence of row.expected.evidence) {
        if (!ids.includes(evidence.question)) fail(id, `evidence question ${evidence.question}`);
        if (!fieldText(state, evidence.field).includes(evidence.quote)) fail(id, `evidence not in state.${evidence.field}: ${evidence.quote}`);
    }
    const perfect = Object.fromEntries(ids.map((questionId) => [questionId, row.expected.answers[questionId] === 'true' ? 0.95 : row.expected.answers[questionId] === 'false' ? 0.05 : 0.5]));
    if (probabilitiesOf(textOf(`\`\`\`json\n${JSON.stringify(perfect)}\n\`\`\``), ids.map((id) => textOf(id))) === null) fail(id, 'probabilitiesOf rejects a well-formed answer');
    const size = row.tags.find((tag) => tag.startsWith('size:')) ?? '';
    table.push([id.padEnd(42), size.padEnd(12), String(row.input.recent.length).padStart(4), String(row.input.history.length).padStart(4), String(state.open_work.length).padStart(3), String(state.last_reply?.length ?? 0).padStart(5), String(state.last_reply?.includes('[…]') ?? false).padEnd(5), String(Buffer.byteLength(document)).padStart(6), row.expected.verdict].join(' '));
}

for (const [plant, wanted] of Object.entries(config.plants)) {
    const primary = rows.filter((row) => row.plants[0] === plant).length;
    if (primary !== wanted) fail('dataset', `plant ${plant}: ${primary} items lead with it, config says ${wanted}`);
}

console.log(`${'id'.padEnd(42)} ${'size'.padEnd(12)} recent facts open reply clip  bytes verdict`);
console.log(table.join('\n'));
console.log(`instructions: ${instructions.length} characters`);
console.log('plants:', Object.fromEntries([...plantCount].sort()));
console.log('sides:', Object.fromEntries([...sideCount].sort()));
console.log(problems.length === 0 ? `ok: ${rows.length} items` : `PROBLEMS (${problems.length}):\n${problems.join('\n')}`);
process.exit(problems.length === 0 ? 0 : 1);
