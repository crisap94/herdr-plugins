// `tab-recap eval --replay <file>`: run the extractor over a stored transcript on a scratch ledger, judge the facts it leaves, print the
// report and the ledger. The plugin's own database is never written (and `--compare-imported` only reads it).
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { RUBRIC_TEXT } from '#src/adapters/rubric.ts';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { CodexTranscripts } from '#src/adapters/codex-transcripts.ts';
import { databasePath } from '#src/adapters/db/database.ts';
import { factsOfTab } from '#src/adapters/db/imported.ts';
import { importedChapters } from '#src/adapters/db/imported-chapters.ts';
import { operatorAnchors } from '#src/adapters/db/operator-anchors.ts';
import { scratchStore } from '#src/adapters/db/scratch.ts';
import { GitLaneRepo } from '#src/adapters/git-lane-repo.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { SystemClock } from '#src/adapters/system-clock.ts';
import { styleFor } from '#src/adapters/terminal-style.ts';
import { AUTO_ORDER, judgeFor, summarizerFor } from '#src/daemon/backends.ts';
import { loadConfig, stateDir } from '#src/daemon/config.ts';
import type { Judge } from '#src/ports/judge.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { EvalOptions } from '#src/recap/application/eval-options.ts';
import { judgedReport } from '#src/recap/application/replay-judge.ts';
import { replay } from '#src/recap/application/replay.ts';
import type { Replayed } from '#src/recap/application/replay.ts';
import { anchoredLine, ledgerText, reportOf } from '#src/recap/application/replay-report.ts';
import { gateReportOf } from '#src/recap/application/eval-stats.ts';
import { gateLines } from '#src/recap/render/eval.ts';

const readers: Readonly<Record<string, () => Transcripts>> = { claude: () => new ClaudeTranscripts(), codex: () => new CodexTranscripts() };

/** The kind from the flag, else from where the file lives (codex keeps its sessions under `.codex`). */
const kindOf = (flag: string | null, file: string): string => flag ?? (file.includes('/.codex/') ? 'codex' : 'claude');

const sizeOf = (file: string): number | null => {
    try {
        return statSync(file).size;
    } catch {
        return null;
    }
};

/** The mechanical checks (no judge), the ledger, and the imported facts beside them when asked. */
function printMechanical(done: Replayed, file: string, beside: string | null): void {
    console.log(`${reportOf(`replay of ${file}: ${done.windows} turns`, done.facts)}\n\nthe ledger after the replay:\n${ledgerText(done.facts, Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
    if (beside !== null) {
        const imported = factsOfTab(databasePath(stateDir()), beside);
        console.log(`\n${imported === null ? `the imported facts of ${beside}: none (no ledger in the database yet)` : reportOf(`the imported facts of ${beside}`, imported)}`);
    }
}

async function run(file: string, reader: Transcripts, options: EvalOptions, size: number): Promise<number> {
    const config = loadConfig();
    const found = await new PathHarnesses(AUTO_ORDER).available();
    const available = isUnknown(found) ? [] : found.ids;
    const scratch = scratchStore();
    const label = options.tab ?? 'replay:t1';
    const pipeline = options.pipeline ?? 'one';
    const writer = summarizerFor(config, available, join(scratch.dir, 'summarizer'));
    const anchors = operatorAnchors(databasePath(stateDir()));
    const judgeLabel = judgeFor(config, available, join(scratch.dir, 'judge'), anchors)?.label ?? 'none';
    try {
        const done = await replay({
            reader, records: scratch.store.records, ledger: scratch.store.ledger, repos: new GitLaneRepo(new SystemClock()), language: config.recapLanguage, log: (line) => { console.error(line); },
            summarizer: () => writer,
        }, file, label, size);
        console.log(`pipeline ${pipeline} · writer ${writer.backend} · judge ${judgeLabel}\n`);
        printMechanical(done, file, options.compareImported);
        console.log(`\n${anchoredLine(done.facts)}\n${gateLines(gateReportOf(scratch.store.inputs.gateCounts(null)), styleFor(process.stdout)).join('\n')}`);
        const judge: Judge | null = judgeFor(config, available, join(scratch.dir, 'judge'), anchors);
        if (judge === null) {
            console.log('\nmodel judging: off (no harness is available for the judge job); the checks above need no model');
            return 0;
        }
        const imported = options.compareImported === null ? null : importedChapters(databasePath(stateDir()), options.compareImported);
        console.log(`\n${(await judgedReport({ judge, store: scratch.store, rubric: RUBRIC_TEXT, label, imported, beside: options.compareImported, style: styleFor(process.stdout), err: (line) => { console.error(line); } })).join('\n')}`);
        return 0;
    } catch (error) {
        console.error(`tab-recap: 1 — ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    } finally {
        scratch.dispose();
    }
}

export function replayCommand(options: EvalOptions): Promise<number> {
    const file = options.replay ?? '';
    if (options.pipeline !== null && options.pipeline !== 'one') {
        console.error(`tab-recap: 2 — --pipeline ${options.pipeline} needs the enumeration step, which this build does not have`);
        return Promise.resolve(2);
    }
    const make = readers[kindOf(options.kind, file)];
    if (make === undefined) {
        console.error('tab-recap: 2 — --kind takes claude or codex');
        return Promise.resolve(2);
    }
    const size = sizeOf(file);
    if (size === null) {
        console.error(`tab-recap: 3 — cannot read ${file}`);
        return Promise.resolve(3);
    }
    return run(file, make(), options, size);
}
