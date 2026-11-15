import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { factsOf, missingOf, questionsFor } from '../../../tab-recap/src/recap/application/brief-coverage.ts';
import type { HistoryFact } from '../../../tab-recap/src/ports/ledger.ts';
import { BANK, INTRO, SETTLED } from './bank.ts';
import type { BankFact } from './bank.ts';


type How = 'literal' | 'paraphrase' | 'absent' | 'vague' | 'detail-changed' | 'foreign';
type ReasonHow = 'literal' | 'paraphrase' | 'dropped';

interface Pick { fact: BankFact; how: How; reason: ReasonHow }

const byId = new Map(BANK.map((fact) => [fact.id, fact]));
const get = (id: string): BankFact => { const fact = byId.get(id); if (fact === undefined) throw new Error(`no fact ${id}`); return fact; };
const of = (project: string): BankFact[] => BANK.filter((fact) => fact.project === project);

function rng(seed: number): () => number {
    let state = seed >>> 0;
    return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
    const next = rng(seed);
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
    return out;
}

const ORDER = ['goal', 'now', 'decisions', 'needs', 'rules', 'next'];
const stop = (text: string): string => (/[.?!]$/.test(text) ? text : `${text}.`);

function sentenceOf(pick: Pick): string[] {
    const { fact, how, reason } = pick;
    if (how === 'absent' || how === 'foreign') return [];
    if (how === 'vague') { if (fact.vague === null) throw new Error(`${fact.id} has no vague form`); return [fact.vague]; }
    if (how === 'detail-changed') { if (fact.wrong === null) throw new Error(`${fact.id} has no changed form`); return [fact.wrong]; }
    const main = how === 'literal' ? stop(fact.text) : fact.para;
    if (fact.section !== 'decisions' || fact.why === null || reason === 'dropped') return [main];
    return [main, reason === 'literal' ? `The reason: ${fact.why}.` : fact.reason!];
}

function briefOf(project: string, picks: readonly Pick[]): string {
    const ordered = [...picks].sort((a, b) => ORDER.indexOf(a.fact.section) - ORDER.indexOf(b.fact.section));
    return [INTRO[project]!, ...ordered.flatMap(sentenceOf)].join(' ');
}

interface Plan {
    id: string;
    plants: string[];
    size: 'small' | 'medium' | 'large';
    project: string;
    facts: string[] | 'all';
    base: How;
    reasons?: ReasonHow;
    how?: Record<string, How>;
    reason?: Record<string, ReasonHow>;
    briefFrom?: { project: string; facts: string[] | 'all' };
    foreign?: string[];
    settled?: boolean;
    seed: number;
    note: string;
}

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const O28 = ['o.g', 'o.w', ...range('o.n', 1, 10), ...range('o.d', 1, 8), ...range('o.r', 1, 5), ...range('o.x', 1, 3)];
const O_KEPT = new Set(['o.g', 'o.w', ...range('o.d', 1, 8), ...range('o.n', 1, 7), ...range('o.r', 1, 3), ...range('o.x', 1, 3)]);
const Q24 = of('quarry-etl').map((fact) => fact.id).filter((id) => !range('q.x', 4, 9).includes(id));

const PLANS: Plan[] = [
    { id: 'cc-01-literal-small-orchard', plants: ['literal', 'reason-kept', 'easy'], size: 'small', project: 'orchard-api', facts: ['o.g', 'o.w', 'o.n2', 'o.d1', 'o.r2', 'o.x2'], base: 'literal', reasons: 'literal', seed: 1, note: 'Every fact and the one reason are in the brief word for word.' },
    { id: 'cc-02-literal-small-lantern', plants: ['literal', 'reason-kept', 'easy'], size: 'small', project: 'lantern-ui', facts: ['l.g', 'l.w', 'l.n2', 'l.d2', 'l.r1', 'l.r2', 'l.x1'], base: 'literal', reasons: 'literal', seed: 2, note: 'Every fact and the one reason are in the brief word for word.' },
    { id: 'cc-03-literal-medium-kestrel', plants: ['literal', 'reason-kept', 'easy'], size: 'medium', project: 'kestrel-sync', facts: 'all', base: 'literal', reasons: 'literal', seed: 3, note: 'Every fact and every reason are in the brief word for word.' },
    { id: 'cc-04-foreign-small-marrow', plants: ['foreign-brief', 'easy'], size: 'small', project: 'marrow-firmware', facts: ['m.g', 'm.n1', 'm.n3', 'm.d2', 'm.r1', 'm.x2'], base: 'foreign', briefFrom: { project: 'lantern-ui', facts: ['l.g', 'l.w', 'l.n1', 'l.d1', 'l.r2', 'l.x1'] }, seed: 4, note: 'The brief belongs to another project: it keeps none of these facts.' },
    { id: 'cc-05-foreign-medium-tidewater', plants: ['foreign-brief', 'easy'], size: 'medium', project: 'tidewater-infra', facts: 'all', base: 'foreign', briefFrom: { project: 'quarry-etl', facts: ['q.g', 'q.w', 'q.n1', 'q.n2', 'q.n3', 'q.n4', 'q.d1', 'q.d2', 'q.d3', 'q.r1', 'q.r2', 'q.x1'] }, seed: 5, note: 'The brief belongs to another project: it keeps none of these facts.' },
    { id: 'cc-06-foreign-large-quarry', plants: ['foreign-brief', 'easy'], size: 'large', project: 'quarry-etl', facts: 'all', base: 'foreign', briefFrom: { project: 'orchard-api', facts: O28 }, seed: 6, note: 'A full-size brief of another project against 30 facts: it keeps none of them.' },
    { id: 'cc-07-paraphrase-small-tidewater', plants: ['paraphrase', 'reason-kept'], size: 'small', project: 'tidewater-infra', facts: ['t.g', 't.w', 't.n2', 't.d1', 't.r1', 't.x2'], base: 'paraphrase', seed: 7, note: 'Every fact is kept in other words with its names, paths and numbers.' },
    { id: 'cc-08-paraphrase-medium-marrow', plants: ['paraphrase', 'reason-kept'], size: 'medium', project: 'marrow-firmware', facts: 'all', base: 'paraphrase', seed: 8, note: 'Every fact and every reason is kept in other words.' },
    { id: 'cc-09-paraphrase-large-quarry', plants: ['paraphrase', 'reason-kept'], size: 'large', project: 'quarry-etl', facts: Q24, base: 'paraphrase', seed: 9, note: 'A large brief that keeps all 24 facts in other words: a good brief that must not be blocked.' },
    { id: 'cc-10-absent-small-kestrel', plants: ['absent', 'paraphrase'], size: 'small', project: 'kestrel-sync', facts: ['k.g', 'k.w', 'k.n1', 'k.n3', 'k.d2', 'k.r1', 'k.x1'], base: 'paraphrase', how: { 'k.n3': 'absent', 'k.x1': 'absent' }, seed: 10, note: 'The question for the operator (blocking) and one later step (not blocking) are left out.' },
    { id: 'cc-11-absent-medium-lantern', plants: ['absent', 'literal', 'paraphrase', 'detail-changed'], size: 'medium', project: 'lantern-ui', facts: 'all', base: 'paraphrase', reasons: 'paraphrase', how: { 'l.g': 'literal', 'l.d1': 'literal', 'l.r2': 'literal', 'l.n2': 'absent', 'l.r1': 'absent', 'l.x2': 'absent', 'l.n1': 'detail-changed' }, reason: { 'l.d1': 'literal' }, seed: 11, note: 'Three facts are left out and one is stated with another browser.' },
    { id: 'cc-12-absent-large-orchard-cap', plants: ['absent', 'paraphrase', 'reason-kept', 'cap-40', 'settled-in-history'], size: 'large', project: 'orchard-api', facts: 'all', base: 'absent', how: Object.fromEntries([...O_KEPT].map((id) => [id, 'paraphrase' as How])), settled: true, seed: 12, note: 'History holds 44 open facts plus settled ones: only the first 40 open are asked. The brief keeps 23 of the 44 and leaves the rest out.' },
    { id: 'cc-13-reason-dropped-small-tidewater', plants: ['reason-dropped', 'paraphrase'], size: 'small', project: 'tidewater-infra', facts: ['t.g', 't.w', 't.n1', 't.d2', 't.r1', 't.x1'], base: 'paraphrase', reason: { 't.d2': 'dropped' }, seed: 13, note: 'Everything is kept except the reason of the one decision.' },
    { id: 'cc-14-reason-dropped-medium-marrow', plants: ['reason-dropped', 'reason-kept', 'paraphrase'], size: 'medium', project: 'marrow-firmware', facts: 'all', base: 'paraphrase', reason: { 'm.d2': 'dropped', 'm.d3': 'dropped' }, seed: 14, note: 'Three decisions are kept; two of them without their reason.' },
    { id: 'cc-15-reason-kept-medium-kestrel', plants: ['reason-kept', 'paraphrase'], size: 'medium', project: 'kestrel-sync', facts: 'all', base: 'paraphrase', seed: 15, note: 'Control for the reason plant: every decision keeps its reason in other words.' },
    { id: 'cc-16-reason-dropped-large-quarry', plants: ['reason-dropped', 'reason-kept', 'absent', 'vague', 'literal', 'paraphrase', 'settled-in-history'], size: 'large', project: 'quarry-etl', facts: 'all', base: 'paraphrase', how: { 'q.g': 'literal', 'q.d1': 'literal', 'q.r1': 'literal', 'q.n2': 'vague', 'q.r3': 'vague', 'q.x5': 'absent', 'q.x6': 'absent', 'q.x7': 'absent', 'q.x8': 'absent', 'q.x9': 'absent' }, reason: { 'q.d1': 'literal', 'q.d2': 'dropped', 'q.d4': 'dropped', 'q.d6': 'dropped', 'q.d7': 'dropped' }, settled: true, seed: 16, note: 'Seven decisions are kept, four without their reason; two facts are only gestured at; five later steps are left out.' },
    { id: 'cc-17-vague-small-lantern', plants: ['vague', 'paraphrase'], size: 'small', project: 'lantern-ui', facts: ['l.g', 'l.w', 'l.n1', 'l.n3', 'l.d3', 'l.r1', 'l.x1'], base: 'paraphrase', how: { 'l.n1': 'vague', 'l.n3': 'vague', 'l.r1': 'vague' }, seed: 17, note: 'Three facts are gestured at without the name, colour or rule that makes them usable.' },
    { id: 'cc-18-detail-changed-medium-quarry', plants: ['detail-changed', 'paraphrase'], size: 'medium', project: 'quarry-etl', facts: ['q.g', 'q.w', 'q.n1', 'q.n2', 'q.n5', 'q.n9', 'q.d1', 'q.d2', 'q.r1', 'q.r2', 'q.x1', 'q.x2'], base: 'paraphrase', how: { 'q.n1': 'detail-changed', 'q.n5': 'detail-changed' }, seed: 18, note: 'Two facts are stated with a different number.' },
    { id: 'cc-19-near-miss-medium-orchard', plants: ['vague', 'detail-changed', 'reason-dropped', 'reason-kept', 'paraphrase'], size: 'medium', project: 'orchard-api', facts: ['o.g', 'o.w', 'o.n1', 'o.n3', 'o.n4', 'o.n9', 'o.n10', 'o.d3', 'o.d5', 'o.r3', 'o.r5', 'o.x1', 'o.x4', 'o.x7'], base: 'paraphrase', how: { 'o.n1': 'vague', 'o.n10': 'vague', 'o.r3': 'vague', 'o.n3': 'detail-changed', 'o.n9': 'detail-changed', 'o.r5': 'detail-changed' }, reason: { 'o.d5': 'dropped' }, seed: 19, note: 'Three facts gestured at, three with a changed number, one decision without its reason.' },
    { id: 'cc-20-only-nonblocking-absent-medium-tidewater', plants: ['just-over', 'absent', 'paraphrase', 'reason-kept'], size: 'medium', project: 'tidewater-infra', facts: 'all', base: 'paraphrase', how: { 't.w': 'absent', 't.x1': 'absent', 't.x2': 'absent' }, seed: 20, note: 'Only facts of sections that do not block (now, next) are left out: the brief passes. Pair of cc-21.' },
    { id: 'cc-21-one-blocking-absent-medium-tidewater', plants: ['just-under', 'absent', 'paraphrase', 'reason-kept'], size: 'medium', project: 'tidewater-infra', facts: 'all', base: 'paraphrase', how: { 't.w': 'absent', 't.x1': 'absent', 't.x2': 'absent', 't.r1': 'absent' }, seed: 20, note: 'The brief of cc-20 with one rule left out: the brief misses. Pair of cc-20.' },
    { id: 'cc-22-only-nonblocking-absent-large-orchard', plants: ['just-over', 'absent', 'paraphrase', 'reason-kept'], size: 'large', project: 'orchard-api', facts: O28, base: 'paraphrase', how: { 'o.x1': 'absent', 'o.x2': 'absent', 'o.x3': 'absent' }, seed: 22, note: 'A large brief that keeps all 25 blocking facts and leaves out three later steps: it passes. Pair of cc-23.' },
    { id: 'cc-23-one-blocking-vague-large-orchard', plants: ['just-under', 'vague', 'absent', 'paraphrase', 'reason-kept'], size: 'large', project: 'orchard-api', facts: O28, base: 'paraphrase', how: { 'o.x1': 'absent', 'o.x2': 'absent', 'o.x3': 'absent', 'o.n4': 'vague' }, seed: 22, note: 'The brief of cc-22 with the question for the operator only gestured at: it misses. Pair of cc-22.' },
    { id: 'cc-24-foreign-fact-medium-kestrel', plants: ['foreign-fact', 'paraphrase', 'reason-kept'], size: 'medium', project: 'kestrel-sync', facts: 'all', base: 'paraphrase', foreign: ['l.n3', 'l.x1'], seed: 24, note: 'The brief keeps every fact of its own task; the ledger also holds two facts of another task, which the brief does not carry.' },
];

const T0 = 1794520800000;

function build(plan: Plan): unknown {
    const own = plan.facts === 'all' ? of(plan.project) : plan.facts.map(get);
    const picks: Pick[] = own.map((fact) => ({ fact, how: plan.how?.[fact.id] ?? plan.base, reason: plan.reason?.[fact.id] ?? plan.reasons ?? 'paraphrase' }));
    const foreign: Pick[] = (plan.foreign ?? []).map((id) => ({ fact: get(id), how: 'foreign', reason: 'dropped' }));
    let brief: string;
    if (plan.briefFrom !== undefined) {
        const source = plan.briefFrom.facts === 'all' ? of(plan.briefFrom.project) : plan.briefFrom.facts.map(get);
        brief = briefOf(plan.briefFrom.project, source.map((fact) => ({ fact, how: 'paraphrase', reason: 'paraphrase' })));
    } else {
        brief = briefOf(plan.project, picks);
    }
    const open = shuffled([...picks, ...foreign], plan.seed);
    const settled = plan.settled === true ? (SETTLED[plan.project] ?? []) : [];
    type Row = Omit<HistoryFact, 'firstAt' | 'lastAt'>;
    const rows: Row[] = open.map((pick) => ({ section: pick.fact.section, text: pick.fact.text, why: pick.fact.why, state: 'open', closedWhy: null, closedAt: null }));
    settled.forEach(([section, text, closedWhy, why], at) => {
        const closed = closedWhy !== null;
        const row: Row = { section, text, why, state: closed ? 'closed' : 'open', closedWhy, closedAt: closed ? 1 : null };
        rows.splice(Math.min(rows.length, 2 + at * 5), 0, row);
    });
    const history: HistoryFact[] = rows.map((fact, at) => {
        const firstAt = T0 + plan.seed * 3600000 + at * 412000;
        const lastAt = firstAt + 95000 + (at % 7) * 61000;
        return { ...fact, closedAt: fact.closedAt === null ? null : lastAt, firstAt, lastAt };
    });
    const asked = factsOf(history);
    const pickOf = new Map(open.map((pick) => [pick.fact.text, pick]));
    const questions: Record<string, { kept: boolean; how: string; fact: string }> = {};
    const synthetic: Record<string, number> = {};
    const ids = Object.keys(questionsFor(asked));
    asked.forEach((fact, at) => {
        const pick = pickOf.get(fact.text);
        if (pick === undefined) throw new Error(`${plan.id}: asked fact has no plan: ${fact.text}`);
        const kept = pick.how === 'literal' || pick.how === 'paraphrase';
        questions[`keeps_${at}`] = { kept, how: pick.how, fact: pick.fact.id };
        if (fact.section === 'decisions' && fact.why !== null) {
            const reasoned = kept && pick.reason !== 'dropped';
            questions[`reason_${at}`] = { kept: reasoned, how: !kept ? pick.how : pick.reason === 'dropped' ? 'reason-dropped' : `reason-${pick.reason}`, fact: pick.fact.id };
        }
    });
    for (const id of ids) {
        if (questions[id] === undefined) throw new Error(`${plan.id}: question ${id} has no expected answer`);
        synthetic[id] = questions[id].kept ? 1 : 0;
    }
    if (Object.keys(questions).length !== ids.length) throw new Error(`${plan.id}: expected answers for questions that are not asked`);
    const missing = missingOf(synthetic, asked).map(({ index, parts }) => ({ index, parts }));
    const notAsked = open.filter((pick) => !asked.some((fact) => fact.text === pick.fact.text)).map((pick) => pick.fact.id);
    return {
        id: plan.id,
        plants: plan.plants,
        tags: [`size:${plan.size}`, `project:${plan.project}`, ...(plan.briefFrom === undefined ? [] : [`brief-project:${plan.briefFrom.project}`])],
        input: { brief, history },
        expected: { ok: missing.length === 0, pass_mark: 0.7, facts_asked: asked.length, questions, missing, not_asked: notAsked, note: plan.note },
    };
}

const items = PLANS.map(build);
const out = process.argv[2] ?? join(import.meta.dirname, '..', 'dataset.jsonl');
writeFileSync(out, `${items.map((item) => JSON.stringify(item)).join('\n')}\n`);
console.log(`wrote ${items.length} items to ${out}`);
