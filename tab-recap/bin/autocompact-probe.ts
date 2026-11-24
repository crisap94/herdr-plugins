import { join } from 'node:path';
import { createRuntime } from '@stateforge-labs/harness-adapters/runtime';
import { deciderOf, isArm } from '#src/adapters/experiment/arms.ts';
import { readPoints } from '#src/adapters/experiment/data.ts';
import { appendJsonl, doneKeys, jsonLines } from '#src/adapters/experiment/io.ts';
import type { DeciderPort, DecidedAnswersResult, Question } from '#src/ports/decider.ts';
import { saying } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { questionsOf } from '#src/recap/application/brief-coverage.ts';
import { parseCheckedFact, type CheckedFact } from '#src/recap/domain/autocompact.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { pooledBy, retriedBy } from '#src/experiment/pool.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
const asText = (value: string): Text => must(parseText(value));
const asFsPath = (value: string): FsPath => must(parseFsPath(value));

const CONCURRENCY = 4;

const value = (name: string): string | null => {
    const at = process.argv.indexOf(`--${name}`);
    return at < 0 ? null : (process.argv[at + 1] ?? null);
};

interface Job { readonly key: string; readonly kind: 'point' | 'brief'; readonly state: Text; readonly questions: ReadonlyMap<Text, Question> }

interface BriefRow { readonly id: string; readonly brief: string; readonly facts: readonly unknown[] }

function briefRowOf(line: string): BriefRow {
    const parsed: unknown = JSON.parse(line);
    const fieldOf = (key: string): unknown => Reflect.get(Object(parsed), key);
    const [id, brief, facts] = [fieldOf('id'), fieldOf('brief'), fieldOf('facts')];
    if (typeof id !== 'string' || typeof brief !== 'string' || !Array.isArray(facts)) throw new Error('autocompact-probe: a briefs.jsonl row has no id, brief and facts');
    return { id, brief, facts };
}

export function jobsOf(dir: string): readonly Job[] {
    const points = [...readPoints(asText(join(dir, 'corpus.jsonl'))), ...readPoints(asText(join(dir, 'outcome-points.jsonl')))];
    const briefs = jsonLines(asText(join(dir, 'briefs.jsonl'))).map(briefRowOf);
    return [
        ...points.map((point): Job => ({ key: point.id, kind: 'point', state: must(parseText(JSON.stringify(point.state))), questions: QUESTIONS })),
        ...briefs.map((row): Job => ({ key: row.id, kind: 'brief', state: must(parseText(JSON.stringify({ brief: row.brief, facts: row.facts }))), questions: questionsOf(row.facts.flatMap((fact): CheckedFact[] => { const checked = parseCheckedFact(fact); return checked === null ? [] : [checked]; })) })),
    ];
}

const usable = (answer: DecidedAnswersResult): boolean => answer.kind === 'decided';

async function ask(decider: DeciderPort, job: Job, log: (line: string) => void): Promise<{ answer: DecidedAnswersResult; attempts: number }> {
    let attempts = 0;
    const answer = await retriedBy(() => { attempts += 1; return decider.ask(job.state, job.questions); }, (result) => (usable(result) ? 'usable' : 'unusable'), { attempts: must(parseCount(3)), baseMs: must(parseMilliseconds(10_000)), onRetry: (n, wait) => { log(`${job.key.slice(0, 12)}: attempt ${n} failed; waiting ${wait / 1000} s`); } });
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
    const done = doneKeys(asText(file), asText('key'));
    const todo = jobsOf(dir).filter((job) => !done.has(asText(job.key)));
    const runtime = createRuntime();
    const deciders = Array.from({ length: CONCURRENCY }, () => deciderOf(arm, runtime));
    let finished = 0;
    await pooledBy(todo, must(parseCount(CONCURRENCY)), async (job, _index, lane) => {
        const decider = deciders[lane];
        if (decider === undefined) throw new Error(`autocompact-probe: no decider for lane ${lane}`);
        const { answer, attempts } = await ask(decider, job, log);
        if (answer.kind === 'decided') appendJsonl(asFsPath(file), { key: job.key, kind: job.kind, answers: answer.answers, tokens: answer.tokens, costUsd: answer.costUsd, tookMs: answer.tookMs, model: answer.model, attempts });
        else appendJsonl(asFsPath(file), { key: job.key, kind: job.kind, unknown: saying(answer.why), attempts });
        finished += 1;
        if (finished % 25 === 0) log(`${arm} rep ${rep}: ${finished}/${todo.length}`);
    });
    log(`${arm} rep ${rep}: done ${todo.length}`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
