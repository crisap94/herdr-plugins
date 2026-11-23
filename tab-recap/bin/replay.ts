import type { AgentKind } from '#src/recap/domain/ids.ts';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { RUBRIC_TEXT } from '#src/adapters/job/prompts/rubric.ts';
import { replayKindOfPath, replayTranscriptRegistry } from '#src/adapters/transcripts/registry.ts';
import { databaseFile } from '#src/adapters/db/database.ts';
import { factsOfTabAt } from '#src/adapters/db/imported.ts';
import { importedChaptersAt } from '#src/adapters/db/imported-chapters.ts';
import { parseSessionPath, parseTabId } from '#src/recap/domain/ids.ts';
import { parseCount, parsePositiveCount } from '#src/recap/domain/count.ts';
import { operatorAnchors } from '#src/adapters/db/operator-anchors.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import { GitLaneRepo } from '#src/adapters/git/lane-repo.ts';
import { AUTO_PATH_KINDS, PathHarnessDirectory } from '#src/adapters/harness/on-path.ts';
import { SystemClock } from '#src/adapters/os/system-clock.ts';
import { styleFor } from '#src/adapters/os/terminal-style.ts';
import { availableIn, enumeratorFor, judgeWith, summarizerFor } from '#src/daemon/backends.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import { loadSettings, stateDirectory } from '#src/daemon/config.ts';
import type { Enumerators } from '#src/ports/enumerators.ts';
import type { JudgePort } from '#src/ports/judge.ts';
import type { Summarizer } from '#src/ports/summarizer.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { EvalRequest } from '#src/recap/application/eval-request.ts';
import { judgedReport } from '#src/recap/application/replay-judge.ts';
import { replayFile } from '#src/recap/application/replay.ts';
import type { Replayed } from '#src/recap/application/replay.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import type { Scratch } from '#src/adapters/db/scratch.ts';
import type { Settings } from '#src/daemon/config.ts';
import { anchoredLine, ledgerText, reportOf } from '#src/recap/application/replay-report.ts';
import { gateReportOf } from '#src/recap/application/eval-stats.ts';
import { createRuntime } from '@stateforge-labs/harness-adapters/runtime';
import { gateLines } from '#src/recap/render/eval.ts';
import { countedWriter } from '#src/recap/application/counted-writer.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { agentKind } from '#src/recap/domain/ids.ts';

export function viewOf(options: Pick<EvalRequest, 'prune'>, config: Pick<Settings, 'writerViewSettings'>): WriterView {
    return options.prune === 'present' ? config.writerViewSettings : FULL_WRITER_VIEW;
}

const sizeOf = (file: string): number | null => {
    try {
        return statSync(file).size;
    } catch {
        return null;
    }
};

export function ranLine(done: Replayed, jobs: { readonly view: WriterView; readonly pipeline: string; readonly mergeTurns: number; readonly writer: string; readonly effort: string; readonly enumerator: string | null; readonly judge: string; readonly calls: { readonly writer: number; readonly enumeration: number } }): string {
    const per = done.turns === 0 ? 0 : done.costUsd / done.turns;
    return `view ${jobs.view.kind} · pipeline ${jobs.pipeline} · merge-turns ${jobs.mergeTurns} · writer ${jobs.writer} ${jobs.effort} · enumeration ${jobs.enumerator ?? 'none'} · judge ${jobs.judge} · cost: $${done.costUsd.toFixed(3)} over ${done.turns} turns ($${per.toFixed(4)} per turn; a harness that reports no cost shows 0) · calls: ${jobs.calls.writer} writer + ${jobs.calls.enumeration} enumeration (${((jobs.calls.writer + jobs.calls.enumeration) / Math.max(1, done.turns)).toFixed(2)} per turn)`;
}

function printMechanical(done: Replayed, file: string, beside: string | null, ran: string): void {
    console.log(`${ran}\n${reportOf(`replay of ${file}: ${done.turns} turns`, done.facts)}\n\nthe ledger after the replay:\n${ledgerText(done.facts, Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
    if (beside !== null) {
        const besideId = parseTabId(beside);
        const imported = besideId.kind === 'ok' ? factsOfTabAt(databaseFile(stateDirectory()), besideId.value) : null;
        console.log(`\n${imported === null ? `the imported facts of ${beside}: none (no ledger in the database yet)` : reportOf(`the imported facts of ${beside}`, imported)}`);
    }
}

function counted(config: Settings, available: readonly AgentKind[], dir: string, runtime: HarnessRuntime): { readonly writer: Summarizer; readonly enumerator: Enumerators | null; readonly calls: { writer: number; enumeration: number } } {
    const calls = { writer: 0, enumeration: 0 };
    const made = summarizerFor(config, availableIn(available), must(parseDirectory(join(dir, 'summarizer'))), runtime);
    const writer = countedWriter(made, () => { calls.writer += 1; });
    const own = enumeratorFor(config, availableIn(available), must(parseDirectory(join(dir, 'enumerator'))), runtime);
    const enumerator: Enumerators | null = own === null ? null : { backend: own.backend, job: own.job, write: (document) => { calls.enumeration += 1; return own.write(document); } };
    return { writer, enumerator, calls };
}

async function replayed(input: { readonly file: string; readonly reader: Transcripts; readonly options: EvalRequest; readonly size: number; readonly judge: string }, scratch: Scratch, parts: { readonly config: Settings; readonly available: readonly AgentKind[]; readonly runtime: HarnessRuntime }): Promise<void> {
    const { config, available, runtime } = parts;
    const { writer, enumerator, calls } = counted(config, available, scratch.dir, runtime);
    const pipeline = input.options.pipeline ?? config.pipeline;
    const view = viewOf(input.options, config);
    const done = await replayFile({
        reader: input.reader, records: scratch.store.records, ledger: scratch.store.ledger, mint: mintFactId, repos: new GitLaneRepo(new SystemClock()), language: must(parseText(config.recapLanguage)), log: (line) => { console.error(line); },
        summarizer: () => writer, pipeline, enumerator: () => enumerator, writerView: view,
    }, must(parseSessionPath(input.file)), must(parseTabId(input.options.tab ?? 'replay:t1')), must(parseCount(input.size)), must(parsePositiveCount(input.options.mergeTurns ?? 1)));
    printMechanical(done, input.file, input.options.compareImported, ranLine(done, { view, pipeline, mergeTurns: input.options.mergeTurns ?? 1, writer: writer.backend, effort: config.effort, enumerator: enumerator?.job ?? null, judge: input.judge, calls }));
    console.log(`\n${anchoredLine(done.facts)}\n${gateLines(gateReportOf(scratch.store.inputs.gateCounts(null)), styleFor(process.stdout)).join('\n')}`);
}

function importedBeside(tab: string | null): ReturnType<typeof importedChaptersAt> {
    const id = tab === null ? null : parseTabId(tab);
    return id?.kind === 'ok' ? importedChaptersAt(databaseFile(stateDirectory()), id.value) : null;
}

async function run(file: string, reader: Transcripts, options: EvalRequest, size: number): Promise<number> {
    const config = loadSettings();
    const found = await new PathHarnessDirectory(AUTO_PATH_KINDS).available();
    const available = isUnknown(found) ? [] : found.ids;
    const runtime = createRuntime();
    const scratch = scratchStore();
    const label = options.tab ?? 'replay:t1';
    const judge: JudgePort | null = judgeWith(config, availableIn(available), must(parseDirectory(join(scratch.dir, 'judge'))), runtime, operatorAnchors(databaseFile(stateDirectory())));
    try {
        await replayed({ file, reader, options, size, judge: judge?.label ?? 'none' }, scratch, { config, available, runtime });
        if (judge === null) {
            console.log('\nmodel judging: off (no harness is available for the judge job); the checks above need no model');
            return 0;
        }
        const imported = importedBeside(options.compareImported);
        console.log(`\n${(await judgedReport({ judge, store: scratch.store, rubric: RUBRIC_TEXT, label, imported, beside: options.compareImported, style: styleFor(process.stdout), err: (line) => { console.error(line); } })).join('\n')}`);
        return 0;
    } catch (error) {
        console.error(`tab-recap: 1 — ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    } finally {
        scratch.dispose();
    }
}

export function replayCommand(options: EvalRequest): Promise<number> {
    const readers = replayTranscriptRegistry();
    const file = options.replay ?? '';
    const kind = replayKindOfPath(options.kind === null ? null : textOf(options.kind), fsPathOf(file));
    const reader = kind === null ? undefined : readers.exact(agentKind(textOf(kind)));
    if (reader === undefined) {
        console.error('tab-recap: 2 — --kind takes claude or codex');
        return Promise.resolve(2);
    }
    const size = sizeOf(file);
    if (size === null) {
        console.error(`tab-recap: 3 — cannot read ${file}`);
        return Promise.resolve(3);
    }
    return run(file, reader, options, size);
}
