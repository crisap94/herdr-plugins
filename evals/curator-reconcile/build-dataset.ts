import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { CASES, type Case } from './dataset-source/cases.ts';
import { FRESH_CASES, FRESH_PROJECTS, type FreshCase } from './dataset-source/fresh.ts';
import { PROJECTS, type Project } from './dataset-source/pools.ts';
import { clipTurn } from '../../tab-recap/src/recap/application/writer-clip.ts';
import { FRESH_ITEMS, FRESH_SEED, sampleOf, shuffledOf } from '../lib/fresh.ts';

// Without --fresh this writes dataset.jsonl exactly as before. With --fresh it writes dataset-fresh.jsonl and fresh-sample.md.
const fresh = process.argv.includes('--fresh');
const out = new URL(fresh ? './dataset-fresh.jsonl' : './dataset.jsonl', import.meta.url);
const sampleOut = new URL('./fresh-sample.md', import.meta.url);
const source: readonly (Case | FreshCase)[] = fresh ? FRESH_CASES : CASES;
const projects: Readonly<Record<string, Project>> = fresh ? FRESH_PROJECTS : PROJECTS;
const PRIMARIES = ['answered-trap', 'long-evidence', 'add-bait', 'near-pair'];

const hex = (seed: string): string => createHash('sha256').update(seed).digest('hex').slice(0, 32);
const MIN = 60_000;
const salt = fresh ? `${FRESH_SEED}/` : '';
const titleOf = (name: string): string => {
    const found = projects[name];
    if (found === undefined) throw new Error(`no project ${name}`);
    return found.title;
};

const built = source.map((each, order) => {
    const now = Date.parse(each.now);
    const facts = fresh ? shuffledOf(each.facts, `${FRESH_SEED}/${each.id}`) : each.facts;
    const keys = facts.map((fact) => fact.k);
    if (new Set(keys).size !== keys.length) throw new Error(`${each.id}: repeated fact key`);
    const idOf = (k: string): string => {
        const at = keys.indexOf(k);
        if (at < 0) throw new Error(`${each.id}: no fact ${k}`);
        return `f${at + 1}`;
    };
    const tab = `w${(order % 4) + 1}:t${(order % 7) + 1}`;
    const task = { tab, key: hex(`${salt}${each.id}/task`) };
    const count = facts.length;
    const open = facts.map((fact, index) => {
        const firstAt = now - (count - index) * 41 * MIN - 95 * MIN;
        return {
            id: hex(`${salt}${each.id}/${fact.k}`), task, section: fact.section, text: fact.text, why: fact.why ?? null, ref: fact.ref ?? null,
            agent: titleOf(each.project), anchor: fact.text.slice(0, 120), firstAt, lastAt: firstAt + (index % 3) * 7 * MIN,
            state: 'open', closedWhy: null, closedAt: null, language: 'en',
        };
    });
    let at = now - 2 * MIN;
    const stamped = each.tail.toReversed().map((entry) => {
        const mine = at;
        at -= entry.role === 'tool' ? 20_000 : 95_000;
        const { summary: _summary, ...rest } = entry;
        return { ...rest, at: mine };
    }).toReversed();
    const summaryTurns = each.tail.flatMap((entry, index) => (entry.summary === true ? [index] : []));
    const summarySpans = summaryTurns.map((index) => {
        const entry = each.tail[index];
        if (entry === undefined || entry.role === 'tool') throw new Error(`${each.id}: bad summary`);
        return clipTurn(entry.role, entry.text).text;
    });
    const close = (each.close ?? []).map((one) => ({ id: idOf(one.k), why: one.why, evidence: one.evidence }));
    const update = (each.update ?? []).map((one) => ({ id: idOf(one.k), text: one.text, evidence: one.evidence }));
    const duplicates = (each.dup ?? []).map((pair) => pair.map(idOf));
    const taken = new Set([...close.map((one) => one.id), ...update.map((one) => one.id), ...duplicates.flat()]);
    const stay = keys.map(idOf).filter((id) => !taken.has(id));
    const traps = fresh ? (each as FreshCase).traps.map((trap) => ({
        kind: trap.kind,
        expect: trap.expect,
        ops: trap.ops.map((op) => (op.op === 'close'
            ? { op: 'close', id: idOf(op.id), why: op.why, ...(op.evidence === undefined ? {} : { evidence: op.evidence }), ...(op.into === undefined ? {} : { into: idOf(op.into) }) }
            : { op: 'add', section: op.section, text: op.text, evidence: op.evidence })),
    })) : [];
    return {
        id: each.id,
        plants: each.plants,
        tags: [each.size, each.project, ...(close.length + update.length + duplicates.length === 0 ? ['no-op-expected'] : [])],
        input: { name: titleOf(each.project), language: 'en', clock: { now, zone: 'UTC' }, open, tail: stamped },
        expected: {
            must_close: close,
            must_update: update,
            must_stay_open: stay,
            duplicates,
            summary_turns: summaryTurns,
            summary_spans: summarySpans,
            summary_claims: (each.claims ?? []).map((one) => ({ id: idOf(one.k), span: one.span })),
            lookalikes: (each.look ?? []).map((one) => ({ id: idOf(one.k), span: one.span })),
            note: each.note,
        },
        traps,
    };
});

type Built = (typeof built)[number];

function sampleMarkdown(rows: readonly Built[]): string {
    const picked = new Set(sampleOf(rows.map((row) => ({ id: row.id, plants: row.plants })), PRIMARIES));
    const parts = [
        `# curator-reconcile fresh sample (seed ${FRESH_SEED})`, '',
        'Six of the 24 fresh items, picked by the seed. Each section gives the plants, the input in short form, the answer key in plain words and the traps.', '',
    ];
    for (const row of rows.filter((each) => picked.has(each.id))) {
        parts.push(`## ${row.id}`, '', `plants: ${row.plants.join(', ')}; size: ${row.tags[0]}`, '', '### Input', '');
        row.input.open.forEach((fact, at) => parts.push(`- f${at + 1} [${fact.section}] ${fact.text}`));
        parts.push('', 'Tail, oldest first:', '');
        row.input.tail.forEach((entry) => {
            const kind = entry.role === 'tool' ? ` (${entry.kind ?? 'tool'}${entry.what === undefined ? '' : `: ${entry.what}`})` : '';
            parts.push(`- ${entry.role}${kind}: ${entry.text}`);
        });
        const { expected } = row;
        parts.push('', '### Answer key', '');
        expected.must_close.forEach((one) => parts.push(`- close ${one.id} as ${one.why.join(' or ')}, quoting "${one.evidence}"`));
        expected.must_update.forEach((one) => parts.push(`- update ${one.id} to "${one.text}", quoting "${one.evidence}"`));
        expected.duplicates.forEach(([into, id]) => parts.push(`- merge ${id} into ${into}`));
        parts.push(`- stay open: ${expected.must_stay_open.join(', ')}`);
        expected.lookalikes.forEach((one) => parts.push(`- lookalike ${one.id}, must not settle it: "${one.span}"`));
        expected.summary_claims.forEach((one) => parts.push(`- summary claim ${one.id}, only in a summary: "${one.span}"`));
        parts.push(`- note: ${expected.note}`, '', '### Traps', '');
        row.traps.forEach((trap) => parts.push(`- ${trap.kind}, expect ${trap.expect}: ${JSON.stringify(trap.ops)}`));
        parts.push('', 'owner: ', '');
    }
    return `${parts.join('\n')}\n`;
}

const items = built.map(({ traps, ...rest }) => (fresh ? { ...rest, fresh: { seed: FRESH_SEED, traps } } : rest));
if (fresh && items.length !== FRESH_ITEMS) throw new Error(`${items.length} fresh items, expected ${FRESH_ITEMS}`);
const lines = items.map((item) => JSON.stringify(item));

writeFileSync(out, `${lines.join('\n')}\n`);
if (fresh) {
    writeFileSync(sampleOut, sampleMarkdown(built));
    console.log(`${lines.length} fresh items -> ${out.pathname}`);
} else {
    console.log(`${lines.length} items -> ${out.pathname}`);
}
