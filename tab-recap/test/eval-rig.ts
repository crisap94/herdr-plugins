import assert from 'node:assert/strict';
import { parseEval } from '#src/recap/application/eval-options.ts';
import type { EvalOptions } from '#src/recap/application/eval-options.ts';
import type { EvalDeps } from '#src/recap/application/eval-run.ts';
import type { Judge, JudgeTask } from '#src/ports/judge.ts';
import { plain } from '#src/recap/render/wrap.ts';
import { cursor, memoryStore } from '#test/db/support.ts';
import { oneTask, withFacts } from '#test/support.ts';

export const DAY = 86_400_000;
export const NOW = 100 * DAY;
export const SECTIONS = { goal: 'Ship retries', now: [], needs: [], done: ['Merged !256.', 'Worked on it.'], decisions: [], next: [], links: [], rules: [] };
export const KEYS = ['t1/goal/0', 't1/done/0', 't1/done/1'];
export const SCORE = JSON.stringify({
    verdicts: KEYS.flatMap((item) => ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', item.includes('goal') ? 'S-goal' : 'S-done'].map((check) => ({ item, check, pass: !(item === 't1/done/1' && check === 'I3'), critique: item === 't1/done/1' && check === 'I3' ? 'names nothing concrete' : '' }))),
    keyfacts: ['!256 is merged'], coverage: [{ keyfact: 0, item: 'state/t1/done/0' }],
});
export const ANSWERS = JSON.stringify({ answers: ['a', 'b', 'c', 'd', 'e', 'f'] });
export const GRADES = JSON.stringify({ grades: [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: true, critique: '' })) });

export interface Rig {
    readonly store: ReturnType<typeof memoryStore>;
    readonly deps: EvalDeps;
    readonly out: string[];
    readonly err: string[];
    readonly asked: string[];
}

export function rig(parts: { readonly judge?: Judge | null; readonly lines?: readonly string[] } = {}): Rig {
    const store = memoryStore();
    const [out, err, asked]: [string[], string[], string[]] = [[], [], []];
    const lines = Array.from(parts.lines ?? []);
    const deps: EvalDeps = {
        inputs: store.inputs, verdicts: store.verdicts, now: (): number => NOW, rubric: 'RUBRIC', style: plain,
        judge: (): Judge | null => (parts.judge === undefined ? scripted({ score: SCORE, readback: ANSWERS, grade: GRADES }) : parts.judge),
        out: (line): void => { out.push(line); }, err: (line): void => { err.push(line); },
        ask: (prompt): Promise<string | null> => { asked.push(prompt); return Promise.resolve(lines.shift() ?? null); },
    };
    return { store, deps, out, err, asked };
}

export function scripted(answers: Readonly<Partial<Record<JudgeTask, string>>>): Judge {
    return { label: 'claude · sonnet · medium', ask: (task) => Promise.resolve({ kind: 'said', text: answers[task] ?? '', costUsd: 0 }) };
}

export function seed(store: Rig['store'], count: number, over: { readonly input?: boolean; readonly gate?: boolean; readonly tab?: string; readonly first?: number } = {}): void {
    for (let n = 0; n < count; n += 1) {
        store.records.recordRun({
            tab: over.tab ?? 'w1:t1', at: NOW - (over.first ?? 1) * DAY + n * 1000, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')],
            ...withFacts(oneTask('', { ...SECTIONS, goal: `Ship retries ${n}` })), ...(over.input === false ? {} : { input: `<recap_input version="1">run ${n}</recap_input>` }),
            ...(over.gate === true ? { gateStats: { refused: { G1: 1 }, flagged: { G8: 2 }, dropped: 0 } } : {}),
        });
    }
}

export const optionsOf = (...argv: string[]): EvalOptions => {
    const parsed = parseEval(argv);
    assert.ok(parsed.kind === 'options', JSON.stringify(parsed));
    return parsed.options;
};

