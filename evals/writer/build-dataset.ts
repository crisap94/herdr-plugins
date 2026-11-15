import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { InputFact, RecapInput } from '../../tab-recap/src/ports/recap-input.ts';
import type { RecapRequest } from '../../tab-recap/src/ports/summarizer.ts';
import type { Entry } from '../../tab-recap/src/ports/transcripts.ts';
import { localTime } from '../../tab-recap/src/recap/application/local-time.ts';
import { writerContext } from '../../tab-recap/src/recap/application/writer-context.ts';
import { jaccard } from '../../tab-recap/src/recap/domain/gates/jaccard.ts';
import { SCENARIOS } from './dataset-scenarios.ts';
import { FRESH_DECISIONS, FRESH_PROJECTS, FRESH_SCENARIOS } from './dataset-fresh-scenarios.ts';
import type { FreshScenario } from './dataset-fresh-scenarios.ts';
import { FRESH_ITEMS, FRESH_SEED, sampleOf } from '../lib/fresh.ts';
import type { Planted, Scenario, SectionName } from './dataset-scenarios.ts';
import { ANCHOR_LEADS, DECISIONS, DONE, MIX, NEEDS, NEXT, PROJECTS, RULES } from './dataset-vocabulary.ts';
import type { Project } from './dataset-vocabulary.ts';

const MINUTE = 60_000;
const G2_ALIKE = 0.6;
// --fresh: the fresh set (FRESH-1). Without it every output is byte for byte today's.
const FRESH = process.argv.includes('--fresh');
const FRESH_BASE = Number.parseInt(createHash('sha256').update(FRESH_SEED).digest('hex').slice(0, 8), 16);

interface Draft {
    readonly key: string | null;
    readonly section: SectionName;
    readonly text: string;
    readonly why: string | null;
    readonly ref: string | null;
    readonly agent: string | null;
    readonly closed: InputFact['closed'];
    readonly first: number;
    readonly last: number;
    readonly anchor: string;
}

function mulberry(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = <T>(list: readonly T[], rand: () => number): T => list[Math.floor(rand() * list.length)] as T;

const plain = (text: string): string => text.replaceAll('`', '');

function anchorFor(text: string, rand: () => number, lead: boolean): string {
    const body = plain(text);
    const said = lead ? `${pick(ANCHOR_LEADS, rand)} ${body.charAt(0).toLowerCase()}${body.slice(1)}` : body;
    return said.slice(0, 120).trim();
}

function sectionOf(rand: () => number): SectionName {
    const roll = rand();
    let sum = 0;
    for (const [section, share] of MIX) {
        sum += share;
        if (roll < sum) return section as SectionName;
    }
    return 'done';
}

function linkOf(project: Project, rand: () => number): string {
    const number = 300 + Math.floor(rand() * 600);
    const forms = [
        `!${number}`, `#${number}`, pick(project.branches, rand), pick(project.things, rand),
        `https://${project.host}/${project.name}/-/merge_requests/${number}`,
        Math.floor(rand() * 0xfffffff).toString(16).padStart(7, '0').slice(0, 7),
    ];
    return pick(forms, rand);
}

function wordingOf(section: SectionName, project: Project, rand: () => number): { text: string; why: string | null } {
    const thing = pick(project.things, rand);
    if (section === 'links') return { text: linkOf(project, rand), why: null };
    if (section === 'decisions') {
        const [text, why] = pick(FRESH ? FRESH_DECISIONS : DECISIONS, rand);
        return { text: text.replace('{t}', thing), why };
    }
    const pool = section === 'next' ? NEXT : section === 'needs' ? NEEDS : section === 'rules' ? RULES : DONE;
    return { text: pick(pool, rand).replace('{t}', thing), why: null };
}

function closedOf(section: SectionName, rand: () => number): InputFact['closed'] {
    if (rand() >= 0.025) return null;
    return section === 'needs' ? 'answered' : section === 'next' ? 'done' : section === 'done' ? 'superseded' : null;
}

function fillerOf(scenario: Scenario, count: number, now: number, rand: () => number, projects: Readonly<Record<string, Project>>): Draft[] {
    const project = projects[scenario.project] as Project;
    const used = new Set<string>();
    const drafts: Draft[] = [];
    let guard = 0;
    while (drafts.length < count && guard < count * 200) {
        guard += 1;
        const section = sectionOf(rand);
        const { text, why } = wordingOf(section, project, rand);
        if (used.has(text)) continue;
        used.add(text);
        const first = now - Math.floor((45 + rand() * 7000) * MINUTE);
        const last = Math.min(now - 32 * MINUTE, first + Math.floor(rand() * 25) * MINUTE);
        const ref = section !== 'links' && rand() < 0.45 ? (rand() < 0.5 ? `!${300 + Math.floor(rand() * 600)}` : pick(project.things, rand)) : null;
        drafts.push({ key: null, section, text, why, ref, agent: rand() < 0.4 ? scenario.agent.label : null, closed: closedOf(section, rand), first, last: Math.max(first, last), anchor: anchorFor(text, rand, true) });
    }
    if (drafts.length < count) throw new Error(`${scenario.id}: only ${drafts.length} of ${count} filler facts could be made`);
    return drafts;
}

function plantedOf(scenario: Scenario, planted: Planted, now: number, rand: () => number): Draft {
    const age = planted.age ?? 60 + Math.floor(rand() * 4000);
    const first = now - age * MINUTE;
    return { key: planted.key, section: planted.section, text: planted.text, why: planted.why ?? null, ref: planted.ref ?? null, agent: rand() < 0.4 ? scenario.agent.label : null, closed: planted.closed ?? null, first, last: first, anchor: anchorFor(planted.text, rand, scenario.fillerFree !== true) };
}

function entriesOf(scenario: Scenario, now: number): Entry[] {
    return scenario.steps.map((step): Entry => {
        if ('u' in step) return { role: 'user', text: step.u, at: now - step.m * MINUTE };
        if ('a' in step) return { role: 'agent', text: step.a, at: now - step.m * MINUTE };
        const [kind, what, text] = step.t;
        return { role: 'tool', text: text ?? '', kind, what };
    });
}

function turnOf(entries: readonly Entry[], span: string, id: string): { index: number; at: number } {
    const index = entries.findIndex((entry) => entry.text.includes(span) || (entry.what ?? '').includes(span));
    if (index < 0) throw new Error(`${id}: span not in any entry: ${span}`);
    const at = entries.slice(index).find((entry) => entry.at !== undefined)?.at ?? entries.findLast((entry) => entry.at !== undefined)?.at;
    if (at === undefined) throw new Error(`${id}: no time for span: ${span}`);
    return { index, at };
}

function build(scenario: Scenario, position: number): unknown {
    const rand = mulberry(FRESH ? FRESH_BASE + position : 7919 * (position + 1));
    const zone = scenario.zone ?? 'UTC';
    const now = Date.UTC(2026, 10, 3 + (position % 10), 8 + (position % 9), 10 + ((position * 7) % 45), 0);
    const planted = scenario.planted.map((each) => plantedOf(scenario, each, now, rand));
    const filler = scenario.fillerFree === true ? [] : fillerOf(scenario, scenario.facts - planted.length, now, rand, FRESH ? FRESH_PROJECTS : PROJECTS);
    const drafts = [...filler, ...planted].toSorted((a, b) => a.first - b.first);
    const facts: InputFact[] = drafts.map((draft, index) => ({
        id: `f${index + 1}`, section: draft.section, text: draft.text, state: draft.closed === null ? 'open' : 'closed', first: draft.first, last: draft.last,
        why: draft.why, ref: draft.ref, anchor: draft.anchor, agent: draft.agent, closed: draft.closed,
    }));
    const idOf = (key: string): string => {
        const index = drafts.findIndex((draft) => draft.key === key);
        if (index < 0) throw new Error(`${scenario.id}: no planted fact "${key}"`);
        return `f${index + 1}`;
    };
    const factOf = (key: string): InputFact => facts.find((fact) => fact.id === idOf(key)) as InputFact;
    const entries = entriesOf(scenario, now);
    const repo = `/work/${scenario.project}`;
    const tab = `w${(position % 8) + 1}${String.fromCharCode(65 + (position % 26))}`;
    const input: RecapInput = {
        tab: { id: `${tab}:t${(position % 4) + 1}`, now, zone },
        agents: [{ id: 'a1', kind: scenario.agent.kind, label: scenario.agent.label, pane: `${tab}:p1`, source: 'transcript', cwd: repo, repo, branch: scenario.agent.branch, files: [] }],
        tasks: [],
        ledgers: [{ task: null, facts }],
        notes: [],
        transcripts: [{ agent: 'a1', entries }],
    };
    const language = scenario.language ?? 'en';
    const request: RecapRequest = { input, language, previousLanguage: scenario.previousLanguage ?? language };
    const label = (at: number): string => localTime(at, now, zone);
    const keyFacts = scenario.key.map((fact, index) => {
        const found = turnOf(entries, fact.span, scenario.id);
        return {
            k: `k${index + 1}`, section: fact.section, accept_sections: [fact.section, ...(fact.accept ?? [])], text: fact.text, why: fact.why ?? null,
            span: fact.span, why_span: fact.whySpan ?? null, entry: found.index, at: label(found.at), via_update_of: fact.updates === undefined ? null : idOf(fact.updates),
        };
    });
    const mustClose = (scenario.close ?? []).map((each) => ({ id: idOf(each.fact), section: factOf(each.fact).section, why: each.why, accept_update: each.update, span: each.span }));
    const updated = new Set(keyFacts.flatMap((fact) => (fact.via_update_of === null ? [] : [fact.via_update_of])));
    const open = facts.filter((fact) => fact.state === 'open');
    const goal = open.filter((fact) => fact.section === 'goal');
    const referenceOps = [
        ...keyFacts.map((fact) => (fact.via_update_of === null
            ? { op: 'add', section: fact.section, text: fact.text, why: fact.why, ref: null, at: fact.at, agent: 'a1', anchor: fact.span }
            : { op: 'update', id: fact.via_update_of, text: fact.text, why: fact.why, anchor: fact.span })),
        ...mustClose.filter((each) => !updated.has(each.id)).map((each) => (FRESH
            ? { op: 'close', id: each.id, why: each.why[0], anchor: each.span }
            : { op: 'close', id: each.id, why: each.why[0] })),
    ];
    const expected = {
        quiet: scenario.key.length === 0,
        key_facts: keyFacts,
        already_in_ledger: (scenario.known ?? []).map((each) => ({ id: idOf(each.fact), span: each.span, naive_add: each.naive, g2_refuses_naive_add: jaccard(factOf(each.fact).text, each.naive) >= G2_ALIKE })),
        must_close: mustClose,
        must_stay: (scenario.stay ?? []).map(idOf),
        must_rewrite: scenario.rewriteTo === undefined ? null : { to: scenario.rewriteTo, ids: open.filter((fact) => fact.section !== 'links').map((fact) => fact.id) },
        one_goal: { open_goal: goal[0]?.id ?? null, bait_span: scenario.goalBait ?? null },
        refuted: (scenario.refuted ?? []).map((each) => ({ claim: each.claim, span: each.span, by_span: each.by })),
        not_established: (scenario.notEstablished ?? []).map((each) => ({ claim: each.claim, reason: each.reason, hidden_span: each.hidden ?? null })),
        optional: scenario.optional ?? [],
        reference_ops: referenceOps,
        reference_complete: scenario.rewriteTo === undefined,
    };
    const meta = { project: scenario.project, size: scenario.size, ledger_facts: facts.length, open_facts: open.length, entries: entries.length, document_bytes: Buffer.byteLength(writerContext(request)) };
    const row = { id: scenario.id, plants: scenario.plants, tags: [`size:${scenario.size}`, `project:${scenario.project}`, ...scenario.tags], meta, input: request, expected };
    if (!FRESH) return row;
    const traps = (scenario as FreshScenario).traps.map((trap) => ({ ...trap, ops: trap.ops.map((op) => ({ ...op, id: idOf(op.id) })) }));
    return { ...row, fresh: { seed: FRESH_SEED, traps } };
}

const FRESH_PRIMARIES = ['close-bait-intent', 'close-bait-partial', 'close-bait-other', 'close-bait-retracted', 'close-bait-hidden', 'quotable-close'];

interface SampleRow {
    readonly id: string;
    readonly plants: readonly string[];
    readonly meta: { readonly project: string; readonly size: string; readonly ledger_facts: number; readonly open_facts: number };
    readonly input: RecapRequest;
    readonly expected: {
        readonly quiet: boolean;
        readonly key_facts: readonly { readonly k: string; readonly section: string; readonly text: string; readonly why: string | null; readonly via_update_of: string | null }[];
        readonly must_close: readonly { readonly id: string; readonly why: readonly string[]; readonly span: string }[];
        readonly must_stay: readonly string[];
        readonly not_established: readonly { readonly claim: string; readonly reason: string }[];
    };
    readonly fresh: { readonly traps: readonly { readonly kind: string; readonly ops: readonly { readonly id: string; readonly why: string; readonly anchor: string }[]; readonly expect: string; readonly g13_refuses: boolean }[] };
}

function sampleMarkdown(rows: readonly SampleRow[], ids: readonly string[]): string {
    const parts: string[] = [`# Fresh sample: writer (seed ${FRESH_SEED})`, ''];
    for (const row of rows.filter((each) => ids.includes(each.id))) {
        const facts = row.input.input.ledgers.flatMap((ledger) => ledger.facts);
        const named = new Set<string>([
            ...row.expected.must_close.map((each) => each.id),
            ...row.expected.must_stay,
            ...row.fresh.traps.flatMap((trap) => trap.ops.map((op) => op.id)),
            ...row.expected.key_facts.flatMap((fact) => (fact.via_update_of === null ? [] : [fact.via_update_of])),
        ]);
        const entries = row.input.input.transcripts.flatMap((lane) => lane.entries);
        parts.push(`## ${row.id}`, '', `Plants: ${row.plants.join(', ')}. Size: ${row.meta.size}. Project: ${row.meta.project}.`,
            `Ledger: ${row.meta.ledger_facts} facts, ${row.meta.open_facts} open. Turns: ${entries.length}.`, '', 'Facts the key names:');
        for (const fact of facts.filter((each) => named.has(each.id))) parts.push(`- ${fact.id} [${fact.section}, ${fact.state}] ${fact.text}`);
        parts.push('', 'Answer key:');
        if (row.expected.quiet) parts.push('- quiet: no key fact, the answer adds nothing');
        for (const fact of row.expected.key_facts) parts.push(`- ${fact.k}: add [${fact.section}] ${fact.text}${fact.why === null ? '' : ` (why: ${fact.why})`}${fact.via_update_of === null ? '' : ` as an update of ${fact.via_update_of}`}`);
        for (const close of row.expected.must_close) parts.push(`- close ${close.id} as ${close.why.join(' or ')}, on the span "${close.span}"`);
        for (const id of row.expected.must_stay) parts.push(`- ${id} stays open`);
        parts.push('', 'Traps (a wrongful close the writer must not make):');
        for (const trap of row.fresh.traps) for (const op of trap.ops) parts.push(`- ${trap.kind}: close ${op.id} as ${op.why}, anchor "${op.anchor}"; expect ${trap.expect}; closeEvidenceGate refuses: ${trap.g13_refuses}`);
        parts.push('', 'Not established by the turns:');
        for (const each of row.expected.not_established) parts.push(`- ${each.claim}: ${each.reason}`);
        parts.push('', 'Turns:');
        for (const entry of entries) parts.push(`- ${entry.role}${entry.what === undefined ? '' : ` (${entry.what})`}: ${entry.text}`);
        parts.push('', 'owner: ', '');
    }
    return parts.join('\n');
}

const scenarios: readonly Scenario[] = FRESH ? FRESH_SCENARIOS : SCENARIOS;
if (FRESH && scenarios.length !== FRESH_ITEMS) throw new Error(`the fresh set has ${scenarios.length} items, FRESH_ITEMS is ${FRESH_ITEMS}`);
const lines = scenarios.map((scenario, position) => JSON.stringify(build(scenario, position)));
if (FRESH) {
    const path = fileURLToPath(new URL('./dataset-fresh.jsonl', import.meta.url));
    writeFileSync(path, `${lines.join('\n')}\n`);
    const sampled = lines.map((line) => JSON.parse(line) as SampleRow);
    writeFileSync(fileURLToPath(new URL('./fresh-sample.md', import.meta.url)), `${sampleMarkdown(sampled, sampleOf(sampled, FRESH_PRIMARIES))}\n`);
    process.stdout.write(`${lines.length} fresh items -> ${path}\n`);
} else {
    writeFileSync(new URL('./dataset.jsonl', import.meta.url), `${lines.join('\n')}\n`);
    process.stdout.write(`${lines.length} items, ${Buffer.byteLength(lines.join('\n'))} bytes\n`);
}
