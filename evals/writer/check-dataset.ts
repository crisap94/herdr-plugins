import { readFileSync } from 'node:fs';
import type { InputFact } from '../../tab-recap/src/ports/recap-input.ts';
import type { RecapRequest } from '../../tab-recap/src/ports/summarizer.ts';
import { instructions } from '../../tab-recap/src/adapters/job/prompts/recap-instructions.ts';
import { anchorSource } from '../../tab-recap/src/recap/application/anchor-source.ts';
import { localTime } from '../../tab-recap/src/recap/application/local-time.ts';
import { parseAnswer } from '../../tab-recap/src/recap/application/ops-answer.ts';
import type { Resolving } from '../../tab-recap/src/recap/application/ops-answer.ts';
import { forTask, judge } from '../../tab-recap/src/recap/application/ops-gating.ts';
import type { TaskGround } from '../../tab-recap/src/recap/application/ops-gating.ts';
import { writerContext } from '../../tab-recap/src/recap/application/writer-context.ts';
import type { Fact, FactId } from '../../tab-recap/src/recap/domain/fact.ts';
import { quotedIn } from '../../tab-recap/src/recap/domain/gates/g11-anchor.ts';
import { jaccard } from '../../tab-recap/src/recap/domain/gates/jaccard.ts';
import { languageOfLine } from '../../tab-recap/src/recap/domain/gates/language.ts';
import { LEDGER_GATES } from '../../tab-recap/src/recap/domain/gates/ledger-gates.ts';
import { PROJECTS } from './dataset-vocabulary.ts';

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
}

const DAY = 24 * 3_600_000;
const TASK = 't1';
const FORBIDDEN = /\/home\/|crisap|herdr|tab-recap|homelab|omarchy|anthropic|@[a-z0-9-]+\.(com|org|net|io)/iu;
const HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(com|org|net|io|dev|local)\b/iu;

const failures: string[] = [];
const fail = (id: string, what: string): void => { failures.push(`${id}: ${what}`); };

function factOf(fact: InputFact, tab: string, language: string): Fact {
    return {
        id: fact.id as FactId, task: { tab, key: TASK }, section: fact.section, text: fact.text, why: fact.why, ref: fact.ref, agent: fact.agent, anchor: fact.anchor,
        firstAt: fact.first, lastAt: fact.last, state: fact.state, closedWhy: fact.closed, closedAt: fact.state === 'closed' ? fact.last : null, language,
    };
}

function groundOf(request: RecapRequest): { resolving: Resolving; ground: TaskGround } {
    const { input } = request;
    const facts = input.ledgers.flatMap((ledger) => ledger.facts).map((fact) => factOf(fact, input.tab.id, request.previousLanguage));
    const entries = input.transcripts.flatMap((lane) => lane.entries);
    return {
        resolving: { tasks: [TASK], agents: input.agents, taskOf: new Map(), turns: entries.flatMap((entry) => (entry.at === undefined ? [] : [entry.at])), clock: { now: input.tab.now, zone: input.tab.zone } },
        ground: {
            key: TASK, tab: input.tab.id, shown: new Map(facts.map((fact) => [String(fact.id), fact])), open: facts.filter((fact) => fact.state === 'open'),
            closedLately: facts.filter((fact) => fact.state === 'closed' && (fact.closedAt ?? 0) >= input.tab.now - DAY), source: anchorSource(input), language: request.language,
            agents: input.agents.flatMap((agent) => [agent.id, agent.label, agent.kind]).filter((name) => name !== '').map((name) => name.toLowerCase()),
        },
    };
}

function gated(request: RecapRequest, text: string): { kind: string; problems: readonly string[]; refused: readonly string[]; flagged: number; kept: number } {
    const { resolving, ground } = groundOf(request);
    const answer = parseAnswer(text, resolving);
    if (answer.kind !== 'ops') return { kind: answer.kind, problems: [], refused: [], flagged: 0, kept: 0 };
    const judged = judge(LEDGER_GATES, forTask(answer.ops, TASK), ground, request.input.tab.now);
    const flaggedAll = LEDGER_GATES.flatMap((gate) => gate.check(forTask(answer.ops, TASK), { now: request.input.tab.now, shown: ground.shown, open: ground.open, closedLately: ground.closedLately, source: ground.source, language: ground.language, agents: ground.agents })).filter((finding) => finding.outcome === 'flag');
    const flagged = flaggedAll.length;
    if (process.env['SHOW_FLAGS'] === '1') for (const finding of flaggedAll) process.stdout.write(`flag ${finding.gate}: ${finding.reason}\n`);
    return { kind: 'ops', problems: answer.problems, refused: judged.refused.map((finding) => `${finding.gate} op ${finding.at}: ${finding.reason}`), flagged, kept: judged.kept.length };
}

const raw = readFileSync(new URL('./dataset.jsonl', import.meta.url), 'utf8').split('\n').filter((line) => line !== '');
const rows: Row[] = raw.map((line) => JSON.parse(line) as Row);
const ids = new Set(rows.map((row) => row.id));
if (ids.size !== rows.length) failures.push('ids are not unique');

let spans = 0;
let referenceOps = 0;
let flags = 0;
let naive = 0;

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

    const open = (id: string, what: string): void => { if (byId.get(id)?.state !== 'open') fail(row.id, `${what} names ${id}, which is not an open fact of the ledger`); };
    const shown = (span: string, what: string): void => {
        spans += 1;
        if (!document.includes(span)) fail(row.id, `${what} span is not in the built document: ${span}`);
        if (!quotedIn(span, source)) fail(row.id, `${what} span is not in the anchor source: ${span}`);
    };
    const labels = new Set(entries.flatMap((entry) => (entry.at === undefined ? [] : [localTime(entry.at, input.tab.now, input.tab.zone)])));

    for (const fact of expected.key_facts) {
        shown(fact.span, fact.k);
        if (fact.span.length > 120) fail(row.id, `${fact.k} span is longer than an anchor`);
        if (fact.why_span !== null) shown(fact.why_span, `${fact.k} why`);
        if ((fact.section === 'decisions') !== (fact.why !== null)) fail(row.id, `${fact.k}: only a decision has a why`);
        if (!labels.has(fact.at)) fail(row.id, `${fact.k} at ${fact.at} is not the time of a turn`);
        if (entries[fact.entry] === undefined) fail(row.id, `${fact.k} entry is out of range`);
        if (fact.via_update_of !== null) open(fact.via_update_of, fact.k);
        if (fact.text.split(/\s+/u).length > 16) fail(row.id, `${fact.k} reference text has more than 16 words`);
        const twin = facts.find((other) => other.state === 'open' && other.id !== fact.via_update_of && jaccard(other.text, fact.text) >= 0.5);
        if (twin !== undefined) fail(row.id, `${fact.k} is close to ledger fact ${twin.id}`);
    }
    for (const known of expected.already_in_ledger) {
        open(known.id, 'already_in_ledger');
        shown(known.span, `already_in_ledger ${known.id}`);
        naive += 1;
        const tried = gated(row.input, JSON.stringify({ ops: [{ op: 'add', section: byId.get(known.id)?.section, text: known.naive_add, why: byId.get(known.id)?.why ?? null, ref: null, at: null, agent: 'a1', anchor: known.span.slice(0, 120) }] }));
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
}

const count = (test: (row: Row) => boolean): number => rows.filter(test).length;
const plants = [...new Set(rows.flatMap((row) => row.plants))].map((plant) => `${plant} ${count((row) => row.plants.includes(plant))}`).join(', ');
const sizes = ['small', 'medium', 'large'].map((size) => `${size} ${count((row) => row.meta.size === size)}`).join(', ');
const bytes = rows.map((row) => row.meta.document_bytes).toSorted((a, b) => a - b);
process.stdout.write(`items ${rows.length}; sizes: ${sizes}; plants: ${plants}\n`);
process.stdout.write(`document bytes min ${bytes[0]} median ${bytes[Math.floor(bytes.length / 2)]} max ${bytes.at(-1)}; spans checked ${spans}; reference operations ${referenceOps} (flags ${flags}); naive duplicate adds tried ${naive}\n`);
if (failures.length > 0) {
    process.stdout.write(`${failures.length} FAILURES\n${failures.join('\n')}\n`);
    process.exit(1);
}
process.stdout.write('all checks pass\n');
