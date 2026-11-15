import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RUBRIC } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import { RECONCILE_CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-reconcile-instructions.ts';
import type { Entry } from '../../tab-recap/src/ports/transcripts.ts';
import { reconcileInput, TAIL_CHARS } from '../../tab-recap/src/recap/application/curator-input.ts';
import { judge } from '../../tab-recap/src/recap/application/ops-gating.ts';
import type { Fact } from '../../tab-recap/src/recap/domain/fact.ts';
import { LEDGER_GATES } from '../../tab-recap/src/recap/domain/gates/ledger-gates.ts';
import type { Operation } from '../../tab-recap/src/recap/domain/ops.ts';
import { quotedIn } from '../../tab-recap/src/recap/domain/quote.ts';
import { EVIDENCE_CHARS, reconciliationOf } from '../../tab-recap/src/recap/domain/reconciliation.ts';
import { FRESH_ITEMS, FRESH_SEED, guardOf, overlapOf } from '../lib/fresh.ts';

// A trap of the fresh set: one wrong answer the item tempts (see dataset-source/fresh.ts). Ids are document ids.
interface TrapOp {
    readonly op: 'close' | 'add';
    readonly id?: string;
    readonly why?: string;
    readonly evidence?: string;
    readonly into?: string;
    readonly section?: string;
    readonly text?: string;
}

interface Trap {
    readonly kind: string;
    readonly expect: 'refused' | 'kept';
    readonly ops: readonly TrapOp[];
}

interface FreshConfig {
    readonly items: number;
    readonly seed: string;
    readonly plants: Readonly<Record<string, number>>;
    readonly sizes: Readonly<Record<string, number>>;
    readonly traps: { readonly refused: number; readonly kept: number };
}

interface Spanned {
    readonly id: string;
    readonly span: string;
}

interface Expected {
    readonly must_close: readonly { readonly id: string; readonly why: readonly string[]; readonly evidence: string }[];
    readonly must_update: readonly { readonly id: string; readonly text: string; readonly evidence: string }[];
    readonly must_stay_open: readonly string[];
    readonly duplicates: readonly (readonly string[])[];
    readonly summary_turns: readonly number[];
    readonly summary_spans: readonly string[];
    readonly summary_claims: readonly Spanned[];
    readonly lookalikes: readonly Spanned[];
    readonly note: string;
}

interface Row {
    readonly id: string;
    readonly plants: readonly string[];
    readonly tags: readonly string[];
    readonly input: { readonly name: string; readonly language: string; readonly clock: { readonly now: number; readonly zone: string }; readonly open: readonly Fact[]; readonly tail: readonly Entry[] };
    readonly expected: Expected;
    readonly fresh?: { readonly seed: string; readonly traps: readonly Trap[] };
}

const PLANTS = ['stale', 'lookalike', 'compaction', 'update', 'duplicate', 'easy', 'answered-trap', 'long-evidence', 'add-bait', 'near-pair'];
const SIZES = ['small', 'medium', 'large'];
const path = process.argv[2];
const file = path === undefined ? new URL('./dataset.jsonl', import.meta.url) : resolve(path);
const parseRows = (text: string): Row[] => text.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as Row);
const rows = parseRows(readFileSync(file, 'utf8'));
// The fresh set is the file named dataset-fresh.jsonl. Its rows must all carry the fresh key, and no other file may.
const fresh = (typeof file === 'string' ? file : file.pathname).endsWith('/dataset-fresh.jsonl');
const tagged = rows.filter((row) => row.fresh !== undefined).length;
const freshConfig: FreshConfig | null = fresh ? (JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')) as { fresh: FreshConfig }).fresh : null;
const textsOf = (row: Row): string[] => [...row.input.open.flatMap((fact) => [fact.text, fact.why, fact.ref]), ...row.input.tail.map((entry) => entry.text)].filter((text): text is string => typeof text === 'string');
const baseRows = fresh ? parseRows(readFileSync(new URL('./dataset.jsonl', import.meta.url), 'utf8')) : [];
const baseTexts = baseRows.flatMap(textsOf);
const baseNames = baseRows.map((row) => row.input.name);
const problems: string[] = [];
if (fresh && tagged !== rows.length) problems.push(`fresh: ${rows.length - tagged} of ${rows.length} rows have no fresh key`);
if (!fresh && tagged > 0) problems.push(`${tagged} rows carry a fresh key, but the file is not dataset-fresh.jsonl`);
const seen = new Set<string>();
const factIds = new Set<string>();
const table: string[] = [];
const counts = new Map<string, number>();

for (const row of rows) {
    const fail = (what: string): void => { problems.push(`${row.id}: ${what}`); };
    if (seen.has(row.id)) fail('repeated id');
    seen.add(row.id);
    if (row.plants.length === 0 || row.plants.some((plant) => !PLANTS.includes(plant))) fail(`unknown plant in ${row.plants.join(',')}`);
    if (!SIZES.includes(row.tags[0] ?? '')) fail('the first tag is not a size');
    [...row.plants, row.tags[0] ?? ''].forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));

    const text = JSON.stringify(row);
    const hosts = [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gu)].map((match) => match[1] ?? '');
    hosts.filter((host) => !host.endsWith('.test')).forEach((host) => { fail(`host outside .test: ${host}`); });
    if (/\/home\/|\/Users\//u.test(text)) fail('a home path');

    const expected = row.expected;
    const built = reconcileInput({ ...row.input, rubric: RUBRIC.items });
    if (!built.document.includes('<rubric>- **I7')) fail('the document has no still-true rubric');
    if (!built.document.startsWith('<curator_input version="1" mode="reconcile">')) fail('the document is not a reconcile document');
    const ids = [...built.facts.keys()];
    if (ids.length !== row.input.open.length || ids.some((id, at) => id !== `f${at + 1}`)) fail('document ids are not f1..fn');
    for (const fact of row.input.open) {
        if (!/^[0-9a-f]{32}$/u.test(fact.id) || factIds.has(fact.id)) fail(`fact id ${fact.id} is malformed or repeated`);
        factIds.add(fact.id);
        if (fact.state !== 'open' || fact.closedWhy !== null || fact.closedAt !== null) fail(`fact ${fact.id} is not open`);
        if (fact.section === 'decisions' && fact.why === null) fail(`decision ${fact.id} has no why`);
        if (fact.lastAt < fact.firstAt || fact.lastAt > row.input.clock.now) fail(`fact ${fact.id} has bad times`);
    }

    const close = expected.must_close.map((one) => one.id);
    const update = expected.must_update.map((one) => one.id);
    const twins = expected.duplicates.flat();
    const sorted = [...close, ...update, ...twins, ...expected.must_stay_open];
    if (new Set(sorted).size !== sorted.length) fail('an id is in two expected lists');
    if (sorted.length !== ids.length || sorted.some((id) => !built.facts.has(id))) fail('the expected lists do not cover exactly the open facts');
    if (expected.duplicates.some((pair) => pair.length !== 2)) fail('a duplicate set is not a pair');

    if (expected.summary_turns.length !== expected.summary_spans.length) fail('summary turns and spans differ in number');
    expected.summary_turns.forEach((at) => { if (row.input.tail[at] === undefined || row.input.tail[at].role === 'tool') fail(`summary turn ${at} is not a turn`); });
    expected.summary_spans.forEach((span) => { if (!built.tail.includes(span)) fail('a summary span is not in the built tail, letter for letter'); });
    if (row.plants.includes('compaction') !== (expected.summary_turns.length > 0)) fail('compaction plant and summary turns disagree');
    const real = expected.summary_spans.reduce((body, span) => body.replace(span, ''), built.tail);
    const inReal = (quote: string): boolean => quotedIn(quote, real);
    const inSummary = (quote: string): boolean => expected.summary_spans.some((span) => quotedIn(quote, span));

    for (const one of [...expected.must_close, ...expected.must_update]) {
        if (one.evidence.length > EVIDENCE_CHARS) fail(`evidence for ${one.id} is longer than ${EVIDENCE_CHARS}`);
        if (!inReal(one.evidence)) fail(`evidence for ${one.id} is not in a real turn of the built tail`);
    }
    for (const one of expected.must_close) {
        const section = built.facts.get(one.id)?.section;
        if (one.why.length === 0 || (one.why.includes('answered') && section !== 'needs')) fail(`close ${one.id}: bad why`);
    }
    for (const one of expected.lookalikes) {
        if (!built.facts.has(one.id)) fail(`lookalike ${one.id} is not a fact`);
        if (!inReal(one.span)) fail(`lookalike span for ${one.id} is not in a real turn`);
        if (close.includes(one.id)) fail(`lookalike ${one.id} is also to be closed`);
    }
    for (const one of expected.summary_claims) {
        if (!built.facts.has(one.id)) fail(`summary claim ${one.id} is not a fact`);
        if (!inSummary(one.span) || inReal(one.span)) fail(`summary claim for ${one.id} is not only in a summary`);
        if (one.span.length > EVIDENCE_CHARS) fail(`summary claim for ${one.id} is too long to be quoted`);
    }
    if (row.plants.includes('stale') !== (close.length + update.length > 0)) fail('stale plant and expected closes disagree');
    if (row.plants.includes('duplicate') !== (twins.length > 0)) fail('duplicate plant and pairs disagree');
    if (row.plants.includes('update') !== (update.length > 0)) fail('update plant and expected updates disagree');
    if (row.tags.includes('no-op-expected') !== (close.length + update.length + twins.length === 0)) fail('no-op tag is wrong');

    const ground = { key: 'k', tab: 't', shown: built.facts, open: [...built.facts.values()], closedLately: [], source: '', language: row.input.language, agents: ['claude', row.input.name.toLowerCase()] };
    const gatedOf = (answer: object): { refused: readonly string[]; gates: number; kept: number } => {
        const checked = reconciliationOf(JSON.stringify(answer), built.facts, built.tail);
        const ops: Operation[] = checked.ops.map((one) => (one.op === 'close' ? { op: 'close', id: one.id, why: one.why } : { op: 'update', id: one.id, text: one.text, why: one.why }));
        const gated = judge(LEDGER_GATES, ops, ground, row.input.clock.now);
        return { refused: checked.refused, gates: gated.refused.filter((finding) => finding.outcome === 'refuse').length, kept: gated.kept.length };
    };
    const oracle = { ops: [
        ...expected.must_close.map((one) => ({ op: 'close', id: one.id, why: one.why[0], evidence: one.evidence })),
        ...expected.must_update.map((one) => ({ op: 'update', id: one.id, text: one.text, why: null, evidence: one.evidence })),
        ...expected.duplicates.map((pair) => ({ op: 'close', id: pair[1], why: 'merged', into: pair[0] })),
    ] };
    const good = gatedOf(oracle);
    if (good.refused.length > 0 || good.gates > 0 || good.kept !== oracle.ops.length) fail(`the expected answer is refused: ${good.refused.join('; ')} gates=${good.gates}`);
    const trap = { ops: expected.summary_claims.map((one) => ({ op: 'close', id: one.id, why: built.facts.get(one.id)?.section === 'needs' ? 'answered' : 'done', evidence: one.span })) };
    const bad = gatedOf(trap);
    if (bad.kept !== trap.ops.length) fail('a close quoting the summary is refused by the plugin already, so the plant shows nothing');

    if (fresh) {
        const traps = row.fresh?.traps ?? [];
        const own = (id: string | undefined): string => expected.must_close.find((one) => one.id === id)?.evidence ?? '';
        if (row.fresh?.seed !== FRESH_SEED) fail('the seed is not the fresh seed');
        for (const reason of guardOf(text)) fail(`guard: ${reason}`);
        const shared = overlapOf(textsOf(row), baseTexts);
        if (shared.length > 0) fail(`overlap with today's set: ${(shared[0] ?? '').slice(0, 60)}`);
        for (const name of baseNames) if (text.includes(name)) fail(`overlap: the project name ${name} of today's set`);
        if (!traps.some((one) => one.expect === 'refused')) fail('no refused trap');
        if (!traps.some((one) => one.expect === 'kept') && expected.lookalikes.length === 0) fail('no kept trap and no lookalike');
        traps.forEach((one, at) => {
            const verdict = gatedOf({ ops: one.ops });
            const refusedNow = verdict.refused.length > 0 || verdict.gates > 0;
            if (one.expect === 'refused' && !refusedNow) fail(`trap ${at} (${one.kind}) is kept, expected refused`);
            if (one.expect === 'kept' && (refusedNow || verdict.kept !== one.ops.length)) fail(`trap ${at} (${one.kind}) is refused, expected kept`);
            if (one.kind === 'answered-trap' && !one.ops.every((op) => op.op === 'close' && op.why === 'answered' && op.id !== undefined && built.facts.get(op.id)?.section !== 'needs')) fail(`trap ${at}: answered-trap is not an answered close of a fact outside needs`);
            if (one.kind === 'long-evidence' && !one.ops.every((op) => op.op === 'close' && (op.evidence ?? '').length > EVIDENCE_CHARS && inReal(op.evidence ?? '') && own(op.id).length > 0 && (op.evidence ?? '').includes(own(op.id)))) fail(`trap ${at}: long-evidence quote is not longer than ${EVIDENCE_CHARS}, real, or holding the expected evidence`);
            if (one.kind === 'add-bait' && !one.ops.some((op) => op.op === 'add')) fail(`trap ${at}: add-bait has no add`);
            if (one.kind === 'near-pair' && !one.ops.every((op) => op.op === 'close' && op.why === 'merged' && op.id !== undefined && op.into !== undefined && expected.must_stay_open.includes(op.id) && expected.must_stay_open.includes(op.into))) fail(`trap ${at}: near-pair is not a merged close of one open fact into another`);
        });
    }

    const omitted = /<tail[^>]* omitted="(\d+)"/u.exec(built.document)?.[1] ?? '0';
    const shownTurns = (built.tail.match(/<turn /gu) ?? []).length;
    table.push([row.id.padEnd(40), String(ids.length).padStart(3), String(row.input.tail.length).padStart(4), String(shownTurns).padStart(4), omitted.padStart(4), String(built.tail.length).padStart(6), String(built.document.length).padStart(6), row.plants.join(',')].join(' '));
    if (built.tail.length > TAIL_CHARS + 3 * row.input.tail.length + 1) fail('the built tail is over the budget');
}

const allTraps = rows.flatMap((row) => row.fresh?.traps ?? []);
const refusedTraps = allTraps.filter((one) => one.expect === 'refused').length;
const keptTraps = allTraps.length - refusedTraps;
if (freshConfig !== null) {
    const wanted: Record<string, number> = { ...freshConfig.plants, ...freshConfig.sizes };
    const at = (name: string): number => counts.get(name) ?? 0;
    if (rows.length !== FRESH_ITEMS || rows.length !== freshConfig.items) problems.push(`fresh: ${rows.length} items, config says ${freshConfig.items}, the set is ${FRESH_ITEMS}`);
    for (const [name, value] of Object.entries(wanted)) if (at(name) !== value) problems.push(`fresh: ${name} is on ${at(name)} items, config says ${value}`);
    for (const [name, value] of counts) if (wanted[name] === undefined) problems.push(`fresh: ${name} (${value} items) is not in config`);
    if (at('stale') < 16) problems.push(`fresh: stale is on ${at('stale')} items, at least 16 needed`);
    if (at('lookalike') < 8) problems.push(`fresh: lookalike is on ${at('lookalike')} items, at least 8 needed`);
    if (at('compaction') !== 4) problems.push(`fresh: compaction is on ${at('compaction')} items, 4 needed`);
    if (at('update') !== 2) problems.push(`fresh: update is on ${at('update')} items, 2 needed`);
    if (at('duplicate') !== 2) problems.push(`fresh: duplicate is on ${at('duplicate')} items, 2 needed`);
    for (const name of ['answered-trap', 'long-evidence', 'add-bait', 'near-pair']) if (at(name) < 6) problems.push(`fresh: ${name} is on ${at(name)} items, at least 6 needed`);
    if (rows.filter((row) => row.tags.includes('no-op-expected')).length > 4) problems.push('fresh: more than 4 no-op-expected items');
    if (at('small') !== 8 || at('medium') !== 12 || at('large') !== 4) problems.push(`fresh: sizes are small ${at('small')} medium ${at('medium')} large ${at('large')}, 8/12/4 needed`);
    if (refusedTraps !== freshConfig.traps.refused || keptTraps !== freshConfig.traps.kept) problems.push(`fresh: traps refused ${refusedTraps} kept ${keptTraps}, config says ${freshConfig.traps.refused} and ${freshConfig.traps.kept}`);
    const sample = readFileSync(new URL('./fresh-sample.md', import.meta.url), 'utf8');
    for (const reason of guardOf(sample)) problems.push(`fresh-sample.md: guard: ${reason}`);
}

console.log(`${'id'.padEnd(40)} fct tail turn omit tailch  docch plants`);
console.log(table.join('\n'));
console.log(`items ${rows.length}; prompt ${RECONCILE_CURATOR_INSTRUCTIONS.length} characters`);
console.log([...counts].map(([name, count]) => `${name} ${count}`).join(', '));
if (problems.length > 0) {
    console.log(problems.join('\n'));
    process.exit(1);
}
console.log('ok: every item parses, builds through reconcileInput, and its expected answer passes the parser and the ledger gates');
if (freshConfig !== null) console.log(`fresh ok: ${rows.length} items, traps refused ${refusedTraps} kept ${keptTraps}, overlap 0, guard 0`);
