import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InputFact } from '../../packages/session-ledger/src/ports/recap-input.ts';
import type { RecapRequest } from '../../packages/session-ledger/src/ports/summarizer.ts';
import { instructions } from '../../tab-recap/src/adapters/job/prompts/recap-instructions.ts';
import { anchorSource } from '../../packages/session-ledger/src/recap/application/anchor-source.ts';
import { localTime } from '../../packages/session-ledger/src/recap/application/local-time.ts';
import { parseAnswer } from '../../packages/session-ledger/src/recap/application/ops-answer.ts';
import type { Resolving } from '../../packages/session-ledger/src/recap/application/ops-answer.ts';
import { forTask, judge } from '../../packages/session-ledger/src/recap/application/ops-gating.ts';
import type { TaskGround } from '../../packages/session-ledger/src/recap/application/ops-gating.ts';
import { writerContext } from '../../packages/session-ledger/src/recap/application/writer-context.ts';
import type { Fact, FactId } from '../../packages/session-ledger/src/recap/domain/fact.ts';
import { quotedIn } from '../../packages/session-ledger/src/recap/domain/gates/g11-anchor.ts';
import { jaccard } from '../../packages/session-ledger/src/recap/domain/gates/jaccard.ts';
import { languageOfLine } from '../../packages/session-ledger/src/recap/domain/gates/language.ts';
import { closeEvidenceGate } from '../../packages/session-ledger/src/recap/domain/gates/g13-close-evidence.ts';
import { LEDGER_GATES } from '../../packages/session-ledger/src/recap/domain/gates/ledger-gates.ts';
import { FRESH_ITEMS, FRESH_SEED, guardOf, overlapOf } from '../lib/fresh.ts';
import { PROJECTS } from './dataset-vocabulary.ts';
import { brand } from '../../packages/session-ledger/src/recap/domain/brand.ts';
import { instant } from '../../packages/session-ledger/src/recap/domain/time.ts';
import { tabIdOf } from '../../packages/session-ledger/src/recap/domain/lane-shape.ts';
import { factIdOf } from '../lib/brands.ts';

const textOf = brand<string, 'Text'>;

interface KeyFact { readonly k: string; readonly section: string; readonly accept_sections: readonly string[]; readonly text: string; readonly why: string | null; readonly span: string; readonly why_span: string | null; readonly entry: number; readonly at: string; readonly via_update_of: string | null }

interface Expected {
    readonly quiet: boolean;
    readonly key_facts: readonly KeyFact[];
    readonly already_in_ledger: readonly { readonly id: string; readonly span: string; readonly naive_add: string; readonly g2_refuses_naive_add: boolean }[];
    readonly must_close: readonly { readonly id: string; readonly section: string; readonly why: readonly string[]; readonly accept_update: boolean; readonly span: string }[];
    readonly must_stay: readonly string[];
    readonly must_rewrite: { readonly to: string; readonly ids: readonly string[] } | null;
    readonly one_goal: { readonly open_goal: string | null; readonly bait_span: string | null };
    readonly refuted: readonly { readonly claim: string; readonly span: string; readonly by_span: string }[];
    readonly not_established: readonly { readonly claim: string; readonly reason: string; readonly hidden_span: string | null }[];
    readonly optional: readonly { readonly text: string; readonly span: string; readonly sections: readonly string[] }[];
    readonly reference_ops: readonly Record<string, unknown>[];
    readonly reference_complete: boolean;
}

interface Row {
    readonly id: string;
    readonly plants: readonly string[];
    readonly tags: readonly string[];
    readonly meta: { readonly project: string; readonly size: string; readonly ledger_facts: number; readonly document_bytes: number };
    readonly input: RecapRequest;
    readonly expected: Expected;
    readonly fresh?: { readonly seed: string; readonly traps: readonly Trap[] };
}

interface Trap {
    readonly kind: string;
    readonly ops: readonly { readonly op: string; readonly id: string; readonly why: string; readonly anchor: string }[];
    readonly expect: string;
    readonly g13_refuses: boolean;
}

const DAY = 24 * 3_600_000;
const TASK = 't1';
const FORBIDDEN = /\/home\/|crisap|herdr|tab-recap|homelab|omarchy|anthropic|@[a-z0-9-]+\.(com|org|net|io)/iu;
const HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(com|org|net|io|dev|local)\b/iu;

const failures: string[] = [];
const fail = (id: string, what: string): void => { failures.push(`${id}: ${what}`); };

function factOf(fact: InputFact, tab: string, language: string): Fact {
    return {
        id: factIdOf(fact.id), task: { tab: tabIdOf(tab), key: textOf(TASK) }, section: fact.section, text: fact.text, why: fact.why, ref: fact.ref, agent: fact.agent, anchor: fact.anchor,
        firstAt: fact.first, lastAt: fact.last, state: fact.state, closedWhy: fact.closed, closedAt: fact.state === 'closed' ? fact.last : null, language: textOf(language),
    };
}

function groundOf(request: RecapRequest): { resolving: Resolving; ground: TaskGround } {
    const { input } = request;
    const facts = input.ledgers.flatMap((ledger) => ledger.facts).map((fact) => factOf(fact, input.tab.id, request.previousLanguage));
    const entries = input.transcripts.flatMap((lane) => lane.entries);
    return {
        resolving: { tasks: [textOf(TASK)], agents: input.agents, taskOf: new Map(), turns: entries.flatMap((entry) => (entry.at === undefined ? [] : [instant(entry.at)])), clock: { now: instant(input.tab.now), zone: textOf(input.tab.zone) } },
        ground: {
            key: textOf(TASK), tab: textOf(input.tab.id), shown: new Map(facts.map((fact) => [textOf(String(fact.id)), fact])), open: facts.filter((fact) => fact.state === 'open'),
            closedLately: facts.filter((fact) => fact.state === 'closed' && (fact.closedAt ?? 0) >= input.tab.now - DAY), source: textOf(anchorSource(input)), language: textOf(request.language),
            agents: input.agents.flatMap((agent) => [agent.id, agent.label, agent.kind]).filter((name) => name !== '').map((name) => textOf(name.toLowerCase())),
        },
    };
}

function gated(request: RecapRequest, text: string): { kind: string; problems: readonly string[]; refused: readonly string[]; flagged: number; kept: number } {
    const { resolving, ground } = groundOf(request);
    const answer = parseAnswer(textOf(text), resolving);
    if (answer.kind !== 'ops') return { kind: answer.kind, problems: [], refused: [], flagged: 0, kept: 0 };
    const judged = judge(LEDGER_GATES, forTask(answer.ops, textOf(TASK)), ground, instant(request.input.tab.now));
    const flaggedAll = LEDGER_GATES.flatMap((gate) => gate.check(forTask(answer.ops, textOf(TASK)), { now: request.input.tab.now, shown: ground.shown, open: ground.open, closedLately: ground.closedLately, source: ground.source, language: ground.language, agents: ground.agents })).filter((finding) => finding.outcome === 'flag');
    const flagged = flaggedAll.length;
    if (process.env['SHOW_FLAGS'] === '1') for (const finding of flaggedAll) process.stdout.write(`flag ${finding.gate}: ${finding.reason}\n`);
    return { kind: 'ops', problems: answer.problems, refused: judged.refused.map((finding) => `${finding.gate} op ${finding.at}: ${finding.reason}`), flagged, kept: judged.kept.length };
}

type Gates = Parameters<typeof judge>[0];

// The gate findings that refuse an answer; empty when the answer does not parse (the parse check reports that).
function refusalsOf(request: RecapRequest, text: string, gates: Gates): readonly string[] {
    const { resolving, ground } = groundOf(request);
    const answer = parseAnswer(textOf(text), resolving);
    if (answer.kind !== 'ops') return [];
    return judge(gates, forTask(answer.ops, textOf(TASK)), ground, instant(request.input.tab.now)).refused.map((finding) => `${finding.gate} op ${finding.at}: ${finding.reason}`);
}

// The file to check: argv[2], or the committed dataset. A copy named dataset-fresh.jsonl gets the fresh checks.
function closeEvidenceRefuses(request: RecapRequest, text: string): boolean {
    const { resolving, ground } = groundOf(request);
    const answer = parseAnswer(textOf(text), resolving);
    if (answer.kind !== 'ops') return false;
    return judge([closeEvidenceGate], forTask(answer.ops, textOf(TASK)), ground, instant(request.input.tab.now)).refused.length > 0;
}

const target = process.argv[2] ?? fileURLToPath(new URL('./dataset.jsonl', import.meta.url));
const FRESH_CHECK = basename(target) === 'dataset-fresh.jsonl';
const raw = readFileSync(target, 'utf8').split('\n').filter((line) => line !== '');
const rows: Row[] = raw.map((line) => JSON.parse(line) as Row);
const ids = new Set(rows.map((row) => row.id));
if (ids.size !== rows.length) failures.push('ids are not unique');

let spans = 0;
let referenceOps = 0;
let flags = 0;
let naive = 0;
let traps = 0;
let refusedByG13 = 0;
let refusedTraps = 0;
let guards = 0;

for (const row of rows) {
    const { input } = row.input;
    const expected = row.expected;
    const facts = input.ledgers.flatMap((ledger) => ledger.facts);
    const byId = new Map(facts.map((fact) => [fact.id, fact]));
    const entries = input.transcripts.flatMap((lane) => lane.entries);
    const document = writerContext(row.input);
    const rules = instructions(row.input);
    const source = anchorSource(input);
    const said = entries.map((entry) => `${entry.text}\n${entry.what ?? ''}`).join('\n');

    if (!document.startsWith('<recap_input version="2">') || rules.length < 2000) fail(row.id, 'the plugin builders did not return a prompt');
    if ((document.match(/<fact /gu) ?? []).length !== facts.length) fail(row.id, 'the document does not show every ledger fact');
    if (new Set(facts.map((fact) => fact.id)).size !== facts.length) fail(row.id, 'fact ids repeat');
    if (Buffer.byteLength(document) !== row.meta.document_bytes) fail(row.id, 'meta.document_bytes is stale');
    if ((row.input.language !== row.input.previousLanguage) !== rules.includes('rewritten in')) fail(row.id, 'the language line of the instructions does not match the item');
    if (FORBIDDEN.test(JSON.stringify(row)) || HOST.test(said)) fail(row.id, 'a name that is not invented or a host outside .test');
    if (facts.filter((fact) => fact.state === 'open' && fact.section === 'goal').length > 1) fail(row.id, 'the ledger opens with more than one goal');
    if (row.plants.length === 0) fail(row.id, 'no plant');
    if (expected.quiet !== (expected.key_facts.length === 0)) fail(row.id, 'quiet does not match key_facts');

    const open = (id: string, what: string): void => { if (byId.get(textOf(id))?.state !== 'open') fail(row.id, `${what} names ${id}, which is not an open fact of the ledger`); };
    const shown = (span: string, what: string): void => {
        spans += 1;
        if (!document.includes(span)) fail(row.id, `${what} span is not in the built document: ${span}`);
        if (!quotedIn(textOf(span), source)) fail(row.id, `${what} span is not in the anchor source: ${span}`);
    };
    const labels = new Set(entries.flatMap((entry) => (entry.at === undefined ? [] : [localTime(entry.at, input.tab.now, input.tab.zone)])));

    for (const fact of expected.key_facts) {
        shown(fact.span, fact.k);
        if (fact.span.length > 120) fail(row.id, `${fact.k} span is longer than an anchor`);
        if (fact.why_span !== null) shown(fact.why_span, `${fact.k} why`);
        if ((fact.section === 'decisions') !== (fact.why !== null)) fail(row.id, `${fact.k}: only a decision has a why`);
        if (!labels.has(textOf(fact.at))) fail(row.id, `${fact.k} at ${fact.at} is not the time of a turn`);
        if (entries[fact.entry] === undefined) fail(row.id, `${fact.k} entry is out of range`);
        if (fact.via_update_of !== null) open(fact.via_update_of, fact.k);
        if (fact.text.split(/\s+/u).length > 16) fail(row.id, `${fact.k} reference text has more than 16 words`);
        const twin = facts.find((other) => other.state === 'open' && other.id !== fact.via_update_of && jaccard(other.text, textOf(fact.text)) >= 0.5);
        if (twin !== undefined) fail(row.id, `${fact.k} is close to ledger fact ${twin.id}`);
    }
    for (const known of expected.already_in_ledger) {
        open(known.id, 'already_in_ledger');
        shown(known.span, `already_in_ledger ${known.id}`);
        naive += 1;
        const tried = gated(row.input, JSON.stringify({ ops: [{ op: 'add', section: byId.get(textOf(known.id))?.section, text: known.naive_add, why: byId.get(textOf(known.id))?.why ?? null, ref: null, at: null, agent: 'a1', anchor: known.span.slice(0, 120) }] }));
        const refusedByG2 = tried.refused.some((line) => line.startsWith('G2'));
        if (refusedByG2 !== known.g2_refuses_naive_add) fail(row.id, `already_in_ledger ${known.id}: g2_refuses_naive_add is ${known.g2_refuses_naive_add} but the gate says ${refusedByG2} (${tried.refused.join(' | ')})`);
    }
    for (const close of expected.must_close) {
        open(close.id, 'must_close');
        shown(close.span, `must_close ${close.id}`);
        if (close.why.includes('answered') && close.section !== 'needs') fail(row.id, `must_close ${close.id}: answered fits only a needs fact`);
        if (expected.must_stay.includes(close.id)) fail(row.id, `${close.id} is in must_close and must_stay`);
    }
    for (const id of expected.must_stay) open(id, 'must_stay');
    if (expected.must_rewrite !== null) {
        for (const id of expected.must_rewrite.ids) open(id, 'must_rewrite');
        if (expected.must_rewrite.to !== row.input.language) fail(row.id, 'must_rewrite.to is not the item language');
        const stale = facts.filter((fact) => fact.state === 'open' && fact.section !== 'links' && languageOfLine(fact.text) === row.input.language);
        if (stale.length > 0) fail(row.id, `ledger facts already read as ${row.input.language}: ${stale.map((fact) => fact.id).join(' ')}`);
    }
    if (expected.one_goal.open_goal !== null) open(expected.one_goal.open_goal, 'one_goal');
    if (expected.one_goal.bait_span !== null) shown(expected.one_goal.bait_span, 'goal bait');
    for (const each of expected.refuted) { shown(each.span, 'refuted'); shown(each.by_span, 'refuted by'); if (said.indexOf(each.span) > said.indexOf(each.by_span)) fail(row.id, 'the refuting span comes before the refuted one'); }
    for (const each of expected.optional) shown(each.span, 'optional');
    for (const each of expected.not_established) {
        if (each.hidden_span === null) continue;
        if (!said.includes(each.hidden_span)) fail(row.id, 'hidden span is not in the stored turn');
        if (document.includes(each.hidden_span)) fail(row.id, 'hidden span is visible in the built document');
    }

    const project = PROJECTS[row.meta.project];
    for (const thing of project?.things ?? []) if (said.includes(thing)) fail(row.id, `filler name ${thing} appears in the turns`);

    const reference = gated(row.input, JSON.stringify({ ops: expected.reference_ops }));
    referenceOps += expected.reference_ops.length;
    flags += reference.flagged;
    if (reference.flagged > 0) process.stdout.write(`note: ${row.id} reference answer draws ${reference.flagged} flag(s), which do not refuse\n`);
    if (reference.kind !== 'ops' || reference.problems.length > 0) fail(row.id, `the reference answer does not parse: ${reference.kind} ${reference.problems.join(' | ')}`);
    if (reference.refused.length > 0) fail(row.id, `the reference answer is refused: ${reference.refused.join(' | ')}`);
    if (reference.kept !== expected.reference_ops.length) fail(row.id, `the reference answer keeps ${reference.kept} of ${expected.reference_ops.length} operations`);
    if (gated(row.input, '{"ops": []}').kind !== 'ops') fail(row.id, 'the empty answer does not parse');

    if (FRESH_CHECK) {
        if (row.fresh?.seed !== FRESH_SEED) fail(row.id, 'the fresh block is missing or has another seed');
        if ((row.fresh?.traps ?? []).length === 0) fail(row.id, 'the fresh block has no trap');
        if (Object.hasOwn(row.input, 'closeEvidence') || Object.hasOwn(row.input, 'retry')) fail(row.id, 'the item sets closeEvidence or retry; the eval arm sets them');
        if (instructions({ ...row.input, closeEvidence: 'on' }) === rules) fail(row.id, 'closeEvidence on does not change the instructions');
        const referenceRefusals = refusalsOf(row.input, JSON.stringify({ ops: expected.reference_ops }), [...LEDGER_GATES, closeEvidenceGate]);
        if (referenceRefusals.length > 0) fail(row.id, `the reference answer is refused with the close-evidence gate: ${referenceRefusals.join(' | ')}`);
        const referenceCloses = expected.reference_ops.filter((op) => op['op'] === 'close');
        for (const close of expected.must_close) {
            const ref = referenceCloses.find((op) => op['id'] === close.id);
            if (ref === undefined) fail(row.id, `must_close ${close.id} has no reference close`);
            else if (ref['anchor'] !== close.span || (ref['why'] !== 'done' && ref['why'] !== 'wrong')) fail(row.id, `the reference close of ${close.id} is not a done or wrong close on its span`);
            if (close.why.some((why) => why !== 'done' && why !== 'wrong')) fail(row.id, `must_close ${close.id} has a reason that G13 does not check`);
        }
        const baits = new Set<string>();
        for (const [index, trap] of (row.fresh?.traps ?? []).entries()) {
            traps += 1;
            if (trap.expect !== 'kept' && trap.expect !== 'refused') fail(row.id, `trap ${index} (${trap.kind}) expects ${trap.expect}, not kept or refused`);
            if (trap.expect === 'refused') refusedTraps += 1;
            for (const op of trap.ops) {
                if (op.op !== 'close') fail(row.id, `trap ${trap.kind} has an operation that is not a close`);
                if (op.why !== 'done') fail(row.id, `trap ${trap.kind} closes ${op.id} as ${op.why}, not done`);
                open(op.id, `trap ${trap.kind}`);
                baits.add(op.id);
                if (!expected.must_stay.includes(op.id)) fail(row.id, `trap ${trap.kind}: bait ${op.id} is not in must_stay`);
                // A trap G13 refuses carries an anchor that no input holds (a paraphrase, or a sentence the document hides);
                // any other trap carries a span the document quotes.
                if (trap.g13_refuses) {
                    if (quotedIn(textOf(op.anchor), source)) fail(row.id, `trap ${trap.kind} anchor is quotable from the input, so G13 would keep it`);
                } else {
                    shown(op.anchor, `trap ${trap.kind}`);
                }
                // The hidden sentence is the not_established span: the loop above checks it is in the stored turn and not in the document.
                if (trap.kind === 'close-bait-hidden' && !expected.not_established.some((each) => each.hidden_span !== null)) fail(row.id, `trap ${trap.kind} has no hidden span in not_established`);
                const bare = JSON.stringify({ ops: [{ op: op.op, id: op.id, why: op.why }] });
                if (!closeEvidenceRefuses(row.input, bare)) fail(row.id, `trap ${trap.kind}: the same close without an anchor is not refused by G13`);
            }
            const trapText = JSON.stringify({ ops: trap.ops });
            const ledger = gated(row.input, trapText);
            if (ledger.kind !== 'ops' || ledger.problems.length > 0) fail(row.id, `trap ${trap.kind} does not parse: ${ledger.kind} ${ledger.problems.join(' | ')}`);
            const refused = ledger.refused.length > 0;
            if (refused !== (trap.expect === 'refused')) fail(row.id, `trap ${trap.kind} expects ${trap.expect}, but the ledger gates ${refused ? `refuse it: ${ledger.refused.join(' | ')}` : 'keep it'}`);
            const g13 = closeEvidenceRefuses(row.input, trapText);
            if (g13) refusedByG13 += 1;
            if (g13 !== trap.g13_refuses) fail(row.id, `trap ${index} (${trap.kind}): g13_refuses is ${trap.g13_refuses} but the close-evidence gate says ${g13}`);
        }
        if (expected.not_established.length < baits.size) fail(row.id, `${baits.size} baits but only ${expected.not_established.length} not_established entries`);
        for (const reason of guardOf(JSON.stringify(row))) {
            guards += 1;
            fail(row.id, `guard: ${reason}`);
        }
    }
}

const count = (test: (row: Row) => boolean): number => rows.filter(test).length;
const plants = [...new Set(rows.flatMap((row) => row.plants))].map((plant) => `${plant} ${count((row) => row.plants.includes(plant))}`).join(', ');
const sizes = ['small', 'medium', 'large'].map((size) => `${size} ${count((row) => row.meta.size === size)}`).join(', ');
const bytes = rows.map((row) => row.meta.document_bytes).toSorted((a, b) => a - b);
process.stdout.write(`items ${rows.length}; sizes: ${sizes}; plants: ${plants}\n`);
process.stdout.write(`document bytes min ${bytes[0]} median ${bytes[Math.floor(bytes.length / 2)]} max ${bytes.at(-1)}; spans checked ${spans}; reference operations ${referenceOps} (flags ${flags}); naive duplicate adds tried ${naive}\n`);
let overlap = 0;
if (FRESH_CHECK) {
    if (rows.length !== FRESH_ITEMS) failures.push(`the fresh set has ${rows.length} items, not ${FRESH_ITEMS}`);
    const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')) as { readonly fresh: { readonly plants: Readonly<Record<string, number>>; readonly sizes: Readonly<Record<string, number>>; readonly traps: { readonly refused: number; readonly kept: number }; readonly close_evidence_refused: number } };
    const tally = (values: readonly string[]): Record<string, number> => {
        const out: Record<string, number> = {};
        for (const value of values) out[value] = (out[value] ?? 0) + 1;
        return out;
    };
    const compare = (name: string, actual: Readonly<Record<string, number>>, wanted: Readonly<Record<string, number>>): void => {
        for (const key of new Set([...Object.keys(actual), ...Object.keys(wanted)])) {
            if ((actual[key] ?? 0) !== (wanted[key] ?? 0)) failures.push(`${name} ${key}: the set has ${actual[key] ?? 0}, config.json says ${wanted[key] ?? 0}`);
        }
    };
    compare('plants', tally(rows.flatMap((row) => row.plants)), config.fresh.plants);
    compare('size', tally(rows.map((row) => row.meta.size)), config.fresh.sizes);
    const allTraps = rows.flatMap((row) => row.fresh?.traps ?? []);
    const refusedCount = allTraps.filter((trap) => trap.expect === 'refused').length;
    const keptCount = allTraps.filter((trap) => trap.expect === 'kept').length;
    if (refusedCount !== config.fresh.traps.refused || keptCount !== config.fresh.traps.kept) failures.push(`traps: the set has refused ${refusedCount} and kept ${keptCount}, config.json says refused ${config.fresh.traps.refused} and kept ${config.fresh.traps.kept}`);
    const g13Count = allTraps.filter((trap) => trap.g13_refuses).length;
    if (g13Count !== config.fresh.close_evidence_refused) failures.push(`close-evidence refusals: the set has ${g13Count}, config.json says ${config.fresh.close_evidence_refused}`);
    compare('bait kind', tally(allTraps.map((trap) => trap.kind)), Object.fromEntries(['close-bait-intent', 'close-bait-partial', 'close-bait-other', 'close-bait-retracted', 'close-bait-hidden'].map((kind) => [kind, 6])));
    const closes = rows.flatMap((row) => row.expected.must_close);
    if (closes.length < 24) failures.push(`the set has ${closes.length} correct closes, not at least 24`);
    if (rows.filter((row) => row.expected.must_close.length > 0).length < 18) failures.push('fewer than 18 items have a correct close');
    if (rows.filter((row) => row.expected.must_close.length === 0).length > 6) failures.push('more than 6 items have no correct close');
    if (rows.filter((row) => row.expected.quiet).length > 4) failures.push('more than 4 items are quiet');
    if (closes.filter((close) => close.why.includes('wrong')).length < 6) failures.push('fewer than 6 correct closes close with wrong');
    for (const row of rows) if (row.meta.document_bytes > 60_000) failures.push(`${row.id}: the document is over 60,000 bytes`);
    const textsOf = (items: readonly Row[]): string[] => items.flatMap((row) => [
        ...row.input.input.ledgers.flatMap((ledger) => ledger.facts.flatMap((fact) => [fact.text, fact.anchor ?? '', fact.why ?? '', fact.ref ?? ''])),
        ...row.input.input.transcripts.flatMap((lane) => lane.entries.flatMap((entry) => [entry.text, entry.what ?? ''])),
    ]);
    const base = readFileSync(fileURLToPath(new URL('./dataset.jsonl', import.meta.url)), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Row);
    const baseTexts = textsOf(base);
    const baseNames = Object.values(PROJECTS).map((project) => project.name);
    for (const row of rows) {
        for (const name of baseNames) if (JSON.stringify(row).includes(name)) fail(row.id, `base project name ${name} appears in the fresh item`);
        const hits = overlapOf(textsOf([row]), baseTexts);
        overlap += hits.length;
        if (hits.length > 0) fail(row.id, `overlap: ${hits.length} strings of 40 characters or more are shared with the base set, for example: ${hits[0]}`);
    }
    for (const reason of guardOf(readFileSync(new URL('./fresh-sample.md', import.meta.url), 'utf8'))) {
        guards += 1;
        failures.push(`fresh-sample.md: guard: ${reason}`);
    }
}
if (failures.length > 0) {
    process.stdout.write(`${failures.length} FAILURES\n${failures.join('\n')}\n`);
    process.exit(1);
}
process.stdout.write('all checks pass\n');
if (FRESH_CHECK) process.stdout.write(`fresh ok: ${rows.length} items, traps refused ${refusedTraps} kept ${traps - refusedTraps}, overlap ${overlap}, guard ${guards}, g13 refuses ${refusedByG13} of ${traps} traps\n`);
