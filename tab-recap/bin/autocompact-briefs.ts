// EXP-002 brief corpus: regenerate the compaction brief of 30 points with the plugin's own brief job, then label each fact against its brief.
import { join } from 'node:path';
import { BRIEF_INSTRUCTIONS } from '#src/adapters/brief-instructions.ts';
import { CodexHarness } from '#src/adapters/codex-harness.ts';
import { readPoints } from '#src/adapters/experiment-data.ts';
import { appendJsonl, doneKeys } from '#src/adapters/experiment-io.ts';
import { Labeller, LABELLER } from '#src/adapters/experiment-labeller.ts';
import type { Point } from '#src/adapters/experiment-point.ts';
import { HarnessBrief } from '#src/adapters/harness-brief.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { compactionInput } from '#src/recap/application/compaction-input.ts';
import { coverageLabelInstructions, coverageLabelsOf } from '#src/experiment/label-prompt.ts';
import { factsOf } from '#src/recap/application/brief-coverage.ts';
import { sectionsOf } from '#src/experiment/coverage.ts';
import { pooled } from '#src/experiment/pool.ts';
import { seeded, shuffled } from '#src/experiment/seeded.ts';

const BRIEFS = 30;
const MIN_FACTS = 5;
const SEED = 42;

/** 30 points of the high-share stratum with at least five facts to check, drawn with the seed. */
export function briefPoints(points: readonly Point[]): readonly Point[] {
    return shuffled(points.filter((point) => point.stratum === 'high' && factsOf(point.history).length >= MIN_FACTS), seeded(SEED)).slice(0, BRIEFS);
}

/** The document the live flow gives the brief job for this point. */
const documentOf = (point: Point): string => compactionInput({
    agent: { kind: 'claude', label: '', repo: null, branch: null }, note: null, current: sectionsOf(point.history), history: point.history, lastBreakAt: point.lastBreakAt,
    recent: point.recent, clock: { now: point.at, zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
});

export async function labelBriefs(dir: string): Promise<void> {
    const [file, log] = [join(dir, 'briefs.jsonl'), (line: string): void => { console.error(`${new Date().toISOString()} ${line}`); }];
    const done = doneKeys(file, 'id');
    const todo = briefPoints(readPoints(join(dir, 'corpus.jsonl'))).filter((point) => !done.has(point.id));
    const writers = Array.from({ length: 6 }, (_, n) => new HarnessBrief(new CodexHarness(join(dir, 'work-brief', `slot-${n}`), 15 * 60_000), LABELLER));
    const labeller = new Labeller(join(dir, 'work-labeller'), 6, log);
    await pooled(todo, 6, async (point, _index, lane) => {
        const began = Date.now();
        const written = await (writers[lane] as HarnessBrief).write(documentOf(point));
        if (isUnknown(written)) { log(`${point.id.slice(0, 8)}: no brief (${saying(written.why)})`); return; }
        const facts = factsOf(point.history);
        const asked = facts.map((fact, n) => ({ n, ...fact }));
        const made = await labeller.ask(coverageLabelInstructions(), { brief: written.text, facts: asked }, (reply) => coverageLabelsOf(reply, asked.map((fact) => ({ n: fact.n, reason: fact.section === 'decisions' && fact.why !== null }))), point.id.slice(0, 8));
        if (made.answer === null) { log(`${point.id.slice(0, 8)}: no coverage labels (${made.why ?? '?'})`); return; }
        appendJsonl(file, { id: point.id, brief: written.text, briefMs: Date.now() - began - made.ms, facts, labels: made.answer, labeller: `codex/${LABELLER.model}/${LABELLER.effort}`, instructionsBytes: BRIEF_INSTRUCTIONS.length });
        log(`brief ${point.id.slice(0, 8)}: ${facts.length} facts`);
    });
}
