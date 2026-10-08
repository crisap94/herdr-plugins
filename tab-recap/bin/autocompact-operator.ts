// EXP-002 operator labels: `node bin/autocompact-label.ts --dir <exp002 dir> --operator <n>` shows n points (state, then what followed) one at a time and
// reads one line per point from stdin: the six answers as 0/1 digits, in the order printed. `s` skips, `q` quits. Answers go to operator-labels.jsonl.
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { readPoints } from '#src/adapters/experiment-data.ts';
import { appendJsonl, doneKeys } from '#src/adapters/experiment-io.ts';
import type { Point } from '#src/adapters/experiment-point.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { seeded, shuffled } from '#src/experiment/seeded.ts';

const IDS = Object.keys(QUESTIONS);

const wrap = (text: string, width = 100): string => text.split('\n').flatMap((line) => line.match(new RegExp(`.{1,${width}}(\\s|$)|\\S+?(\\s|$)`, 'g')) ?? ['']).map((line) => `  ${line.trimEnd()}`).join('\n');

function show(point: Point, n: number, total: number): void {
    const { state, hindsight } = point;
    console.log(`\n=== point ${n}/${total} · share ${point.share ?? '?'} % ===`);
    console.log(`GOAL:\n${wrap(state.goal ?? '(none)')}\nOPEN WORK:\n${wrap(state.open_work.map((item) => `[${item.section}] ${item.text}`).join('\n') || '(none)')}`);
    console.log(`LAST PROMPT:\n${wrap(state.last_prompt ?? '(none)')}\nLAST REPLY:\n${wrap(state.last_reply ?? '(none)')}`);
    console.log(`RECENT TURNS:\n${wrap(state.recent_turns.map((turn) => `${turn.role}: ${turn.text}`).join('\n'))}`);
    console.log(`--- WHAT FOLLOWED ---\nNEXT PROMPT:\n${wrap(hindsight.next_prompt ?? '(none)')}\nENTRIES:\n${wrap(hindsight.following.map((entry) => `${entry.role}${entry.kind === undefined ? '' : `/${entry.kind}`}: ${entry.text}`).join('\n'))}`);
    console.log(`\nQuestions, in order:\n${IDS.map((id, i) => `  ${i + 1}. ${id}`).join('\n')}`);
}

export async function operatorLabels(dir: string, count: number): Promise<void> {
    const file = join(dir, 'operator-labels.jsonl');
    const done = doneKeys(file, 'id');
    const points = shuffled(readPoints(join(dir, 'corpus.jsonl')), seeded(7)).slice(0, count).filter((point) => !done.has(point.id));
    const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
    for (const [n, point] of points.entries()) {
        show(point, n + 1, points.length);
        process.stdout.write(`answers (${IDS.length} digits of 0/1, s skip, q quit): `);
        const typed: unknown = (await lines.next()).value;
        if (typeof typed !== 'string' || typed.trim() === 'q') return;
        const digits = typed.replace(/\s/g, '');
        if (new RegExp(`^[01]{${IDS.length}}$`).test(digits)) appendJsonl(file, { id: point.id, labels: Object.fromEntries(IDS.map((id, i) => [id, Number(digits[i])])), at: Date.now() });
    }
}
