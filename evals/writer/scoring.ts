import { unfenced } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import type { InputFact } from '../../tab-recap/src/ports/recap-input.ts';
import type { RecapRequest } from '../../tab-recap/src/ports/summarizer.ts';
import { anchorSource } from '../../tab-recap/src/recap/application/anchor-source.ts';
import { parseAnswer, type Resolving } from '../../tab-recap/src/recap/application/ops-answer.ts';
import { forTask, judge, type TaskGround } from '../../tab-recap/src/recap/application/ops-gating.ts';
import type { Fact, FactId, RunId } from '../../tab-recap/src/recap/domain/fact.ts';
import type { Finding } from '../../tab-recap/src/recap/domain/gates/gate.ts';
import { jaccard } from '../../tab-recap/src/recap/domain/gates/jaccard.ts';
import { languageOfLine } from '../../tab-recap/src/recap/domain/gates/language.ts';
import { LEDGER_GATES } from '../../tab-recap/src/recap/domain/gates/ledger-gates.ts';
import { apply, type Operation } from '../../tab-recap/src/recap/domain/ops.ts';
import type { Answer, Graded, JudgeView, Mark } from '../lib/types.ts';
import { transcriptOf, type WriterItem } from './prompt.ts';

const TASK = 't1';
const DAY = 24 * 3_600_000;

export const GATE_IDS: readonly string[] = ['G1', 'G2', 'G3', 'G5', 'G6', 'G10', 'G11', 'G12', 'L'];

export const CODE_CRITERIA: readonly string[] = ['W1', 'W1s', ...GATE_IDS.map((gate) => `W2.${gate}`), 'W3', 'W4', 'W5', 'W10', 'W12a', 'W12b', 'W13a', 'W13b'];

function factOf(fact: InputFact, tab: string, language: string): Fact {
    return {
        id: fact.id as FactId, task: { tab, key: TASK }, section: fact.section, text: fact.text, why: fact.why, ref: fact.ref, agent: fact.agent, anchor: fact.anchor,
        firstAt: fact.first, lastAt: fact.last, state: fact.state, closedWhy: fact.closed, closedAt: fact.state === 'closed' ? fact.last : null, language,
    };
}

export function groundOf(request: RecapRequest): { readonly resolving: Resolving; readonly ground: TaskGround } {
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

export interface Outcome {
    readonly kind: 'ops' | 'old-shape' | 'invalid';
    readonly why: string;
    readonly problems: readonly string[];
    readonly given: readonly Operation[];
    readonly refused: readonly Finding[];
    readonly kept: readonly Operation[];
    readonly ledger: readonly Fact[];
    readonly ground: TaskGround;
}

const cache = new Map<string, Outcome>();

export function outcomeOf(item: WriterItem, text: string): Outcome {
    const key = `${item.id}\n${text}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    const { resolving, ground } = groundOf(item.input);
    const answer = parseAnswer(unfenced(text), resolving);
    let found: Outcome;
    if (answer.kind !== 'ops') {
        found = { kind: answer.kind, why: answer.kind === 'invalid' ? answer.why : 'the answer has the old recap shape', problems: [], given: [], refused: [], kept: [], ledger: [...ground.shown.values()], ground };
    } else {
        const now = item.input.input.tab.now;
        const given = forTask(answer.ops, TASK);
        const judged = judge(LEDGER_GATES, given, ground, now);
        const out = new Set(judged.refused.map((finding) => finding.at));
        let made = 0;
        const folded = apply([...ground.shown.values()], judged.kept, { id: 'eval' as RunId, task: { tab: ground.tab, key: TASK }, at: now, language: item.input.language, mint: () => `eval-${(made += 1)}` as FactId });
        found = { kind: 'ops', why: '', problems: answer.problems, given, refused: judged.refused, kept: given.filter((_op, at) => !out.has(at)), ledger: folded.ledger, ground };
    }
    cache.set(key, found);
    return found;
}

const idOf = (op: Operation): string | null => (op.op === 'add' ? null : op.id);

const sectionOf = (outcome: Outcome, op: Operation): string | null => (op.op === 'add' ? op.section : (outcome.ground.shown.get(op.id)?.section ?? null));

const isEdit = (op: Operation): boolean => op.op === 'add' || op.op === 'update';

export function applies(item: WriterItem): Record<string, boolean> {
    const expected = item.expected;
    const on: Record<string, boolean> = {
        W1: true,
        W1s: true,
        W3: !expected.quiet,
        W4: expected.quiet,
        W5: true,
        W10: expected.key_facts.some((fact) => fact.section === 'decisions'),
        W12a: expected.must_close.length > 0,
        W12b: expected.must_stay.length > 0,
        W13a: expected.must_rewrite !== null,
        W13b: expected.must_rewrite !== null,
    };
    for (const gate of GATE_IDS) on[`W2.${gate}`] = true;
    return on;
}

export function rewritten(item: WriterItem, outcome: Outcome): number | null {
    const target = item.expected.must_rewrite;
    if (target === null) return null;
    return target.ids.filter((id) => outcome.kept.some((op) => op.op === 'update' && op.id === id && languageOfLine(op.text) !== item.input.previousLanguage)).length;
}

function passesOf(item: WriterItem, outcome: Outcome): Record<string, boolean> {
    const expected = item.expected;
    const kept = outcome.kept;
    const passes: Record<string, boolean> = { W1: true, W1s: outcome.problems.length === 0 };
    for (const gate of GATE_IDS) passes[`W2.${gate}`] = !outcome.refused.some((finding) => finding.gate === gate);
    passes['W3'] = kept.some(isEdit);
    passes['W4'] = !outcome.given.some((op) => op.op === 'add');
    const goals = outcome.ledger.filter((fact) => fact.section === 'goal' && fact.state === 'open' && fact.task.key === TASK).length;
    const second = outcome.refused.some((finding) => finding.gate === 'L' && finding.reason.includes('second-goal'));
    const bait = expected.one_goal.bait_span !== null && outcome.given.some((op) => op.op === 'add' && op.section === 'goal');
    passes['W5'] = goals <= 1 && !second && !bait;
    passes['W10'] = kept.some((op) => (op.op === 'add' || op.op === 'update') && op.why !== null && sectionOf(outcome, op) === 'decisions');
    passes['W12a'] = expected.must_close.every((close) => {
        const on = kept.filter((op) => idOf(op) === close.id);
        const closed = on.some((op) => op.op === 'close' && op.why !== null && close.why.includes(op.why));
        const updated = close.accept_update && on.some((op) => op.op === 'update');
        return closed || updated || (close.section === 'now' && on.length === 0);
    });
    passes['W12b'] = !kept.some((op) => op.op === 'close' && expected.must_stay.includes(op.id));
    const target = expected.must_rewrite;
    const updatedIds = new Set(kept.flatMap((op) => (op.op === 'update' ? [op.id] : [])));
    passes['W13a'] = target !== null && target.ids.some((id) => updatedIds.has(id));
    const stale = target !== null && kept.some((op) => op.op === 'update' && target.ids.includes(op.id) && languageOfLine(op.text) === item.input.previousLanguage);
    passes['W13b'] = target !== null && target.ids.every((id) => updatedIds.has(id)) && !stale;
    return passes;
}

export function grade(item: WriterItem, text: string): Graded {
    const on = applies(item);
    const outcome = outcomeOf(item, text);
    const marks: Record<string, Mark> = {};
    if (outcome.kind !== 'ops') {
        for (const criterion of CODE_CRITERIA) marks[criterion] = on[criterion] === true ? false : null;
        return { parsed: false, marks };
    }
    const passes = passesOf(item, outcome);
    for (const criterion of CODE_CRITERIA) marks[criterion] = on[criterion] === true ? (passes[criterion] ?? false) : null;
    return { parsed: true, marks };
}

export function judgeApplies(item: WriterItem, text: string): Record<string, boolean> | null {
    const outcome = outcomeOf(item, text);
    if (outcome.kind !== 'ops') return null;
    const edits = outcome.kept.some(isEdit);
    return { WJ1: !item.expected.quiet, WJ2: edits, WJ3: outcome.kept.some((op) => op.op === 'add'), WJ4: edits };
}

const factLine = (fact: Fact): string => `- ${String(fact.id)} [${fact.section}, ${fact.state}] ${fact.text}${fact.why === null ? '' : ` (why: ${fact.why})`}`;

function opLine(outcome: Outcome, op: Operation): string {
    const section = sectionOf(outcome, op) ?? 'unknown';
    if (op.op === 'close') return `close ${op.id} | section: ${section} | why: ${op.why ?? '-'}`;
    const head = op.op === 'add' ? 'add' : `update ${op.id}`;
    return `${head} | section: ${section} | text: ${op.text} | why: ${op.why ?? '-'} | anchor: ${op.anchor ?? '-'}`;
}

export function view(item: WriterItem, text: string): JudgeView {
    const outcome = outcomeOf(item, text);
    const expected = item.expected;
    const shown = outcome.ground.shown;
    const named = [...new Set([...expected.already_in_ledger.map((each) => each.id), ...expected.must_close.map((each) => each.id), ...expected.must_stay, ...expected.key_facts.flatMap((fact) => (fact.via_update_of === null ? [] : [fact.via_update_of]))])];
    const lines: string[] = ['Transcript (as the writer saw it):', transcriptOf(item), '', 'Ledger facts this case names:'];
    lines.push(...(named.length === 0 ? ['none'] : named.flatMap((id) => { const fact = shown.get(id); return fact === undefined ? [] : [factLine(fact)]; })));
    lines.push('', 'Open ledger facts closest to each kept add:');
    const adds = outcome.kept.flatMap((op) => (op.op === 'add' ? [op] : []));
    if (adds.length === 0) lines.push('no kept add');
    for (const add of adds) {
        const near = outcome.ground.open.map((fact) => ({ fact, score: jaccard(add.text, fact.text) })).sort((a, b) => b.score - a.score).slice(0, 5);
        lines.push(`Kept add "${add.text}":`, ...near.map((each) => factLine(each.fact)));
    }
    lines.push('', 'Key facts:');
    if (expected.key_facts.length === 0) lines.push('Key facts: none');
    for (const fact of expected.key_facts) lines.push(`- ${fact.k} [${fact.section}] ${fact.text}${fact.why === null ? '' : ` (reason: ${fact.why})`} | said at ${fact.at}: "${fact.span}"`);
    lines.push('', 'Claims the input does not support:');
    if (expected.refuted.length === 0 && expected.not_established.length === 0) lines.push('none');
    for (const claim of expected.refuted) lines.push(`- ${claim.claim} (said: "${claim.span}"; withdrawn later: "${claim.by_span}")`);
    for (const claim of expected.not_established) lines.push(`- ${claim.claim} (${claim.reason})`);
    const kept = outcome.kept.map((op) => opLine(outcome, op));
    return { case: lines.join('\n'), answer: kept.length === 0 ? '(no kept operation)' : kept.join('\n') };
}

const REWRITE: Readonly<Record<string, (id: string) => string>> = {
    es: (id) => `El registro conserva la tarea ${id} para el equipo`,
    en: (id) => `The ledger keeps the task ${id} for the team`,
};

export function stubAnswer(item: WriterItem): string {
    const target = item.expected.must_rewrite;
    const write = target === null ? undefined : REWRITE[target.to];
    const rewrites = target === null || write === undefined ? [] : target.ids.map((id) => ({ op: 'update', id, text: write(id), why: null, anchor: null }));
    return JSON.stringify({ ops: [...item.expected.reference_ops, ...rewrites] });
}

export interface Extras {
    readonly audit: string;
    readonly gate_refusals: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly problems: Readonly<Record<string, number>>;
    readonly unparsed: readonly { readonly config: string; readonly id: string; readonly repetition: number; readonly kind: string; readonly why: string }[];
    readonly rewrites: readonly { readonly config: string; readonly id: string; readonly repetition: number; readonly rewritten: number; readonly of: number }[];
}

export function extras(items: readonly WriterItem[], answers: readonly Answer[], configs: readonly string[], audit: string): Extras {
    const byId = new Map(items.map((item) => [item.id, item]));
    const refusals: Record<string, Record<string, number>> = {};
    const problems: Record<string, number> = {};
    const unparsed: { config: string; id: string; repetition: number; kind: string; why: string }[] = [];
    const rewrites: { config: string; id: string; repetition: number; rewritten: number; of: number }[] = [];
    for (const config of configs) {
        refusals[config] = Object.fromEntries(GATE_IDS.map((gate) => [gate, 0]));
        problems[config] = 0;
    }
    for (const answer of answers) {
        const item = byId.get(answer.id);
        const counts = refusals[answer.config];
        if (item === undefined || counts === undefined || answer.text === null) continue;
        const outcome = outcomeOf(item, answer.text);
        if (outcome.kind !== 'ops') {
            unparsed.push({ config: answer.config, id: answer.id, repetition: answer.repetition, kind: outcome.kind, why: outcome.why });
            continue;
        }
        for (const finding of outcome.refused) counts[finding.gate] = (counts[finding.gate] ?? 0) + 1;
        problems[answer.config] = (problems[answer.config] ?? 0) + outcome.problems.length;
        const count = rewritten(item, outcome);
        const target = item.expected.must_rewrite;
        if (count !== null && target !== null) rewrites.push({ config: answer.config, id: answer.id, repetition: answer.repetition, rewritten: count, of: target.ids.length });
    }
    const order = <T extends { config: string; id: string; repetition: number }>(a: T, b: T): number => a.config.localeCompare(b.config) || a.id.localeCompare(b.id) || a.repetition - b.repetition;
    return { audit, gate_refusals: refusals, problems, unparsed: unparsed.sort(order), rewrites: rewrites.sort(order) };
}

export function extrasMarkdown(found: Extras): string {
    const gates = [...new Set(Object.values(found.gate_refusals).flatMap((counts) => Object.keys(counts)))];
    const lines: string[] = ['', '## writer: reported only (no pass mark)', '', `- ${found.audit}`, '- The plugin shrinks the transcript with fittedCall for a harness with a prompt limit; the SDK transports have none, so the full document is sent. Not verified against the plugin path.', '- The correction round is not run: every mark is on the first answer.', ''];
    lines.push('### Operations refused, by gate (all parsed answers)', '');
    lines.push(`| Configuration | ${gates.join(' | ')} | Parse problems |`);
    lines.push(`|---|${gates.map(() => '---').join('|')}|---|`);
    for (const [config, counts] of Object.entries(found.gate_refusals)) lines.push(`| ${config} | ${gates.map((gate) => String(counts[gate] ?? 0)).join(' | ')} | ${found.problems[config] ?? 0} |`);
    lines.push('', '### Answers the parser rejected', '');
    if (found.unparsed.length === 0) lines.push('None.');
    for (const each of found.unparsed) lines.push(`- ${each.config} ${each.id} rep ${each.repetition}: ${each.kind}${each.why === '' ? '' : `, ${each.why}`}`);
    lines.push('', '### Facts rewritten after a language change (W13b count, not a mark)', '');
    if (found.rewrites.length === 0) lines.push('None.');
    for (const each of found.rewrites) lines.push(`- ${each.config} ${each.id} rep ${each.repetition}: ${each.rewritten} of ${each.of}`);
    lines.push('');
    return lines.join('\n');
}
