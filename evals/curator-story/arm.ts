import { CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-instructions.ts';
import type { Curated, CuratorMode, Curators } from '../../packages/session-ledger/src/ports/curators.ts';
import type { CurationRun } from '../../packages/session-ledger/src/ports/stories.ts';
import { unknown as unknownResult } from '../../packages/session-ledger/src/ports/unknowable.ts';
import { answerTextOf } from '../../packages/session-ledger/src/recap/application/recap-shape.ts';
import type { ReconcilingDeps } from '../../packages/session-ledger/src/recap/application/ledger-reconcile.ts';
import { storyAnswerOf, type StoryReading } from '../../tab-recap/src/recap/application/job-kit/story-repair.ts';
import type { RepairMode } from '../../packages/session-ledger/src/recap/application/job-kit/repair.ts';
import { curationOf } from '../../tab-recap/src/recap/domain/curation.ts';
import { factIdOf, type FactId } from '../../packages/session-ledger/src/recap/domain/fact.ts';
import { parseText, textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';
import { plainOf, type ArmCounters } from '../lib/arm.ts';
import { joinedCalled, type ArmedAnswer, type ArmRecord, type Asker, type Rounded } from '../lib/runner.ts';
import type { Called, Item } from '../lib/types.ts';
import { built, type StoryItem } from './prompt.ts';
import { joins, readAnswer } from './scoring.ts';
import { tabIdOf } from '../../packages/session-ledger/src/recap/domain/lane-shape.ts';
import { causeOf } from '../../packages/session-ledger/src/recap/domain/failure-cause.ts';

// One job of the story eval, driven through the plugin's own storyAnswerOf.
// The writer sends each call through the runner's asker, so both calls share the job's pool slot, backoff and call cap.
export function storyRound(mode: RepairMode): (raw: Item, ask: Asker) => Promise<Rounded> {
    return async (raw, ask) => {
        const item = raw as StoryItem;
        const calls: Called[] = [];
        const lines: string[] = [];
        const writer: Curators = {
            backend: textOf('eval'),
            write: async (document: string, _mode?: CuratorMode): Promise<Curated> => {
                const done = await ask({ system: CURATOR_INSTRUCTIONS, user: document });
                calls.push(done);
                if (done.failure_kind !== null || done.text === null) return unknownResult({ why: 'unreachable', detail: causeOf(textOf(`${done.failure_kind} ${done.failure_detail ?? ''}`)) });
                return { kind: 'curated', text: textOf(done.text) };
            },
        };
        const { document, facts: named } = built(item);
        const first = await writer.write(document);
        if (first.kind !== 'curated') {
            return { called: joinedCalled(calls, null), arm: { mode, repair_calls: 0, repair_input_tokens: 0, repair_output_tokens: 0, applied_ops: 0 } };
        }
        const reading: StoryReading = (answer) => {
            const open = new Set<FactId>();
            for (const [id, fact] of named) {
                if (fact.state === 'open') open.add(factIdOf(id));
            }
            const text = answer.kind === 'curated' ? answer.text : '';
            const read = parseText(text);
            return curationOf(read.kind === 'ok' ? answerTextOf(read.value) : textOf(text), open);
        };
        const run: CurationRun = { task: { tab: tabIdOf('t'), key: textOf('k') }, at: item.input.clock.now, language: textOf(item.input.language) };
        const kept = await storyAnswerOf({ repair: () => mode, log: (line: string) => { lines.push(line); } } as unknown as ReconcilingDeps, { writer, run, sent: parseText(document), first, reading });
        const final = kept.kind === 'curated' ? kept.text : first.text;
        const repairs = lines.filter((line) => line.includes(': story repair — ')).length;
        const applied = reading({ kind: 'curated', text: final }).merges.length;
        return {
            called: joinedCalled(calls, final),
            arm: { mode, repair_calls: repairs, repair_input_tokens: calls[1]?.input_tokens ?? 0, repair_output_tokens: calls[1]?.output_tokens ?? 0, applied_ops: applied },
        };
    };
}

// Counters per configuration over the rows of one arm run, read the way the daemon reads them.
export function storyCounters(items: readonly StoryItem[], rows: readonly ArmedAnswer[], configs: readonly string[], mode: string): ArmCounters[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    return configs.map((config) => {
        const scope = rows.filter((row) => row.config === config && byId.has(row.id));
        const arms: ArmRecord[] = scope.map((row) => {
            if (row.arm?.mode !== mode) throw new Error(`a row without the arm ${mode}`);
            return row.arm;
        });
        let wrongful = 0;
        let unparsed = 0;
        let refused = 0;
        for (const row of scope) {
            const text = row.text;
            if (text === null) continue;
            const item = byId.get(row.id) as StoryItem;
            const read = readAnswer(item, plainOf(text));
            if (read === null) {
                unparsed += 1;
                continue;
            }
            for (const merge of read.curation.merges) {
                if (item.expected.merge_pairs.every((pair) => !joins(merge, pair.ids[0], pair.ids[1]))) wrongful += 1;
            }
            refused += read.curation.refused.length;
        }
        const sum = (pick: (arm: ArmRecord) => number): number => arms.reduce((total, arm) => total + pick(arm), 0);
        return {
            config,
            wrongful_closes: wrongful,
            applied_ops: sum((arm) => arm.applied_ops),
            unparsed,
            refused_ops: refused,
            repair_calls: sum((arm) => arm.repair_calls),
            repair_input_tokens: sum((arm) => arm.repair_input_tokens),
            repair_output_tokens: sum((arm) => arm.repair_output_tokens),
            tokens_measured: !arms.some((arm) => arm.repair_calls > 0 && arm.repair_input_tokens === 0 && arm.repair_output_tokens === 0),
        };
    });
}
