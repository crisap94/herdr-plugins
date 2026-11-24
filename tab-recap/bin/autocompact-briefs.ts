import { join } from 'node:path';
import { BRIEF_INSTRUCTIONS } from '#src/adapters/job/prompts/brief-instructions.ts';
import { CLAUDE_KIND } from '#src/adapters/transcripts/claude/transcripts.ts';
import { LIBRARY_IDS, LibraryHarnessPort } from '#src/adapters/harness/library.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import { readPoints } from '#src/adapters/experiment/data.ts';
import { appendJsonl, doneKeys } from '#src/adapters/experiment/io.ts';
import { Labeller, LABELLER } from '#src/adapters/experiment/labeller.ts';
import type { Point } from '#src/adapters/experiment/point.ts';
import { HarnessBrief } from '#src/adapters/job/brief.ts';
import { isUnknown, saying } from '@stateforge-labs/session-ledger';
import { compactionMaterialInput } from '#src/recap/application/compaction-material.ts';
import { coverageLabelInstructions, coverageLabelsIn } from '#src/experiment/label-prompt.ts';
import { checkedFactsOf } from '#src/recap/application/brief-coverage.ts';
import { sectionsOf } from '#src/experiment/coverage.ts';
import { pooledBy } from '#src/experiment/pool.ts';
import { drawsOf, shuffledBy } from '#src/experiment/seeded.ts';
import { must } from '@stateforge-labs/session-ledger';
import { countOf, parseCount } from '@stateforge-labs/session-ledger';
import { parseFactIndex } from '#src/recap/domain/fact-index.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { uncheckedMilliseconds } from '#src/recap/domain/ids.ts';
import { instant } from '@stateforge-labs/session-ledger';
const asText = (value: string): Text => must(parseText(value));
const asFsPath = (value: string): FsPath => must(parseFsPath(value));

const BRIEFS = 30;
const MIN_FACTS = 5;
const SEED = 42;

export function briefPoints(points: readonly Point[]): readonly Point[] {
    return shuffledBy(points.filter((point) => point.stratum === 'high' && checkedFactsOf(point.history).length >= MIN_FACTS), drawsOf(must(parseCount(SEED)))).slice(0, BRIEFS);
}

const documentOf = (point: Point): string => compactionMaterialInput({
    agent: { kind: textOf(CLAUDE_KIND), label: textOf(''), repo: null, branch: null }, note: null, current: sectionsOf(point.history), history: point.history, lastBreakAt: point.lastBreakAt === null ? null : instant(point.lastBreakAt),
    recent: point.recent, clock: { now: instant(point.at), zone: textOf(Intl.DateTimeFormat().resolvedOptions().timeZone) },
});

export async function labelBriefs(dir: string, runtime: HarnessRuntime): Promise<void> {
    const [file, log] = [join(dir, 'briefs.jsonl'), (line: string): void => { console.error(`${new Date().toISOString()} ${line}`); }];
    const done = doneKeys(asText(file), asText('id'));
    const todo = briefPoints(readPoints(asText(join(dir, 'corpus.jsonl')))).filter((point) => !done.has(asText(point.id)));
    const writers = Array.from({ length: 6 }, () => new HarnessBrief(new LibraryHarnessPort(runtime, LIBRARY_IDS.codex, uncheckedMilliseconds(15 * 60_000)), LABELLER));
    const labeller = new Labeller(runtime, countOf(6), log);
    await pooledBy(todo, must(parseCount(6)), async (point, _index, lane) => {
        const began = Date.now();
        const writer = writers[lane];
        if (writer === undefined) throw new Error(`autocompact-briefs: no writer for lane ${lane}`);
        const written = await writer.write(textOf(documentOf(point)));
        if (isUnknown(written)) { log(`${point.id.slice(0, 8)}: no brief (${saying(written.why)})`); return; }
        const facts = checkedFactsOf(point.history);
        const asked = facts.map((fact, n) => ({ n, ...fact }));
        const made = await labeller.ask(coverageLabelInstructions(), { brief: written.text, facts: asked }, (reply) => { const found = coverageLabelsIn(reply, asked.map((fact) => ({ n: must(parseFactIndex(fact.n)), reason: fact.section === 'decisions' && fact.why !== null ? 'yes' : 'no' }))); return found === null ? null : Object.fromEntries([...found].map(([n, label]) => [String(n), label])); }, asText(point.id.slice(0, 8)));
        if (made.answer === null) { log(`${point.id.slice(0, 8)}: no coverage labels (${made.why ?? '?'})`); return; }
        appendJsonl(asFsPath(file), { id: point.id, brief: written.text, briefMs: Date.now() - began - made.ms, facts, labels: made.answer, labeller: `codex/${LABELLER.model}/${LABELLER.effort}`, instructionsBytes: BRIEF_INSTRUCTIONS.length });
        log(`brief ${point.id.slice(0, 8)}: ${facts.length} facts`);
    });
}
