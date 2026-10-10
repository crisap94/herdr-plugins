import { join } from 'node:path';
import { deciderOf, isArm } from '#src/adapters/experiment-arms.ts';
import { readPoints } from '#src/adapters/experiment-data.ts';
import { appendJsonl, doneKeys, readJsonl } from '#src/adapters/experiment-io.ts';
import type { Decider, DecidedResult, Noul } from '#src/ports/decider.ts';
import { saying } from '#src/ports/unknowable.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { questionsFor } from '#src/recap/application/brief-coverage.ts';
import type { CoverageFact } from '#src/recap/application/brief-coverage.ts';
import { pooled, retried } from '#src/experiment/pool.ts';

const CONCURRENCY = 4;

const value = (name: string): string | null => {
    const at = process.argv.indexOf(`--${name}`);
    return at < 0 ? null : (process.argv[at + 1] ?? null);
};

interface Job { readonly key: string; readonly kind: 'point' | 'brief'; readonly state: object; readonly questions: Readonly<Record<string, Noul>> }

interface BriefRow { readonly id: string; readonly brief: string; readonly facts: readonly CoverageFact[] }

export function jobsOf(dir: string): readonly Job[] {
    const points = [...readPoints(join(dir, 'corpus.jsonl')), ...readPoints(join(dir, 'outcome-points.jsonl'))];
    const briefs = readJsonl(join(dir, 'briefs.jsonl')) as readonly BriefRow[];
    return [
        ...points.map((point): Job => ({ key: point.id, kind: 'point', state: point.state, questions: QUESTIONS })),
        ...briefs.map((row): Job => ({ key: row.id, kind: 'brief', state: { brief: row.brief, facts: row.facts }, questions: questionsFor(row.facts) })),
    ];
}

const usable = (answer: DecidedResult): boolean => answer.kind === 'decided';

async function ask(decider: Decider, job: Job, log: (line: string) => void): Promise<{ answer: DecidedResult; attempts: number }> {
    let attempts = 0;
    const answer = await retried(() => { attempts += 1; return decider.ask(job.state, job.questions); }, usable, { attempts: 3, baseMs: 10_000, onRetry: (n, wait) => { log(`${job.key.slice(0, 12)}: attempt ${n} failed; waiting ${wait / 1000} s`); } });
    return { answer, attempts };
}

const USAGE = 'usage: autocompact-probe.ts --dir <exp002 dir> --arm jev|haiku-low|haiku-medium|luna-low --rep 1|2';

async function main(): Promise<void> {
    const [dir, arm, rep] = [value('dir'), value('arm'), value('rep')];
    if (dir === null || arm === null || !isArm(arm) || (rep !== '1' && rep !== '2')) {
        console.error(USAGE);
        process.exitCode = 2;
        return;
    }
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
