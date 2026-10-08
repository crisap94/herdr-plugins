// EXP-002 probe: one arm answers the six questions on every corpus point and the coverage questions on every brief fact.
// `node bin/autocompact-probe.ts --dir <exp002 dir> --arm jev|haiku-low|haiku-medium|luna-low --rep 1|2`. Answers go to answers-<arm>-<rep>.jsonl (resumable).
import { join } from 'node:path';
import { deciderOf, isArm } from '#src/adapters/experiment-arms.ts';
import { readPoints } from '#src/adapters/experiment-data.ts';
import { appendJsonl, doneKeys, readJsonl } from '#src/adapters/experiment-io.ts';
import type { Decider, DecidedResult } from '#src/ports/decider.ts';
import { saying } from '#src/ports/unknowable.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { COVERAGE_QUESTIONS, questionsFor } from '#src/experiment/coverage.ts';
import { pooled, retried } from '#src/experiment/pool.ts';

const CONCURRENCY = 4;

const at = (name: string): string | undefined => process.argv[process.argv.indexOf(`--${name}`) + 1];

interface Job { readonly key: string; readonly kind: 'point' | 'fact'; readonly state: object; readonly ids: readonly string[] }

interface BriefRow { readonly id: string; readonly brief: string; readonly facts: readonly { readonly n: number; readonly section: string; readonly text: string; readonly why: string | null }[] }

/** Every point of the corpus (and of the outcome set), then every fact of every brief. */
export function jobsOf(dir: string): readonly Job[] {
    const points = [...readPoints(join(dir, 'corpus.jsonl')), ...readPoints(join(dir, 'outcome-points.jsonl'))];
    const briefs = readJsonl(join(dir, 'briefs.jsonl')) as readonly BriefRow[];
    return [
        ...points.map((point): Job => ({ key: point.id, kind: 'point', state: point.state, ids: Object.keys(QUESTIONS) })),
        ...briefs.flatMap((row) => row.facts.map((fact): Job => ({ key: `${row.id}#${fact.n}`, kind: 'fact', state: { brief: row.brief, fact: { section: fact.section, text: fact.text, why: fact.why } }, ids: questionsFor(fact) }))),
    ];
}

const usable = (answer: DecidedResult): boolean => answer.kind === 'decided';

async function ask(decider: Decider, job: Job, log: (line: string) => void): Promise<{ answer: DecidedResult; attempts: number }> {
    const questions = Object.fromEntries(job.ids.map((id) => [id, job.kind === 'point' ? QUESTIONS[id] : COVERAGE_QUESTIONS[id]]).filter((pair) => pair[1] !== undefined));
    let attempts = 0;
    const answer = await retried(() => { attempts += 1; return decider.ask(job.state, questions as Parameters<Decider['ask']>[1]); }, usable, { attempts: 3, baseMs: 10_000, onRetry: (n, wait) => { log(`${job.key.slice(0, 12)}: attempt ${n} failed; waiting ${wait / 1000} s`); } });
    return { answer, attempts };
}

async function main(): Promise<void> {
    const [dir, arm, rep] = [at('dir'), at('arm'), at('rep')];
    if (dir === undefined || arm === undefined || !isArm(arm) || (rep !== '1' && rep !== '2')) throw new Error('usage: autocompact-probe.ts --dir <exp002 dir> --arm jev|haiku-low|haiku-medium|luna-low --rep 1|2');
    const [file, log] = [join(dir, `answers-${arm}-${rep}.jsonl`), (line: string): void => { console.error(`${new Date().toISOString()} ${line}`); }];
    const done = doneKeys(file, 'key');
    const todo = jobsOf(dir).filter((job) => !done.has(job.key));
    const deciders = Array.from({ length: CONCURRENCY }, (_, lane) => deciderOf(arm, join(dir, 'work-probe'), lane));
    let finished = 0;
    await pooled(todo, CONCURRENCY, async (job, _index, lane) => {
        const { answer, attempts } = await ask(deciders[lane] as Decider, job, log);
        if (answer.kind === 'decided') appendJsonl(file, { key: job.key, kind: job.kind, answers: answer.answers, tokens: answer.tokens, costUsd: answer.costUsd, tookMs: answer.tookMs, model: answer.model, attempts });
        else appendJsonl(file, { key: job.key, kind: job.kind, unknown: saying(answer.why), attempts });
        finished += 1;
        if (finished % 25 === 0) log(`${arm} rep ${rep}: ${finished}/${todo.length}`);
    });
    log(`${arm} rep ${rep}: done ${todo.length}`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
