import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { CASES } from './dataset-source/cases.ts';
import { PROJECTS } from './dataset-source/pools.ts';
import { clipTurn } from '../../tab-recap/src/recap/application/writer-clip.ts';

const out = new URL('./dataset.jsonl', import.meta.url);

const hex = (seed: string): string => createHash('sha256').update(seed).digest('hex').slice(0, 32);
const MIN = 60_000;

const lines = CASES.map((each, order) => {
    const now = Date.parse(each.now);
    const keys = each.facts.map((fact) => fact.k);
    if (new Set(keys).size !== keys.length) throw new Error(`${each.id}: repeated fact key`);
    const idOf = (k: string): string => {
        const at = keys.indexOf(k);
        if (at < 0) throw new Error(`${each.id}: no fact ${k}`);
        return `f${at + 1}`;
    };
    const tab = `w${(order % 4) + 1}:t${(order % 7) + 1}`;
    const task = { tab, key: hex(`${each.id}/task`) };
    const count = each.facts.length;
    const open = each.facts.map((fact, index) => {
        const firstAt = now - (count - index) * 41 * MIN - 95 * MIN;
        return {
            id: hex(`${each.id}/${fact.k}`), task, section: fact.section, text: fact.text, why: fact.why ?? null, ref: fact.ref ?? null,
            agent: PROJECTS[each.project].title, anchor: fact.text.slice(0, 120), firstAt, lastAt: firstAt + (index % 3) * 7 * MIN,
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
    return JSON.stringify({
        id: each.id,
        plants: each.plants,
        tags: [each.size, each.project, ...(close.length + update.length + duplicates.length === 0 ? ['no-op-expected'] : [])],
        input: { name: PROJECTS[each.project].title, language: 'en', clock: { now, zone: 'UTC' }, open, tail: stamped },
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
    });
});

writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`${lines.length} items -> ${out.pathname}`);
