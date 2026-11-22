import { CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-instructions.ts';
import { RECONCILE_CURATOR_INSTRUCTIONS } from '../../tab-recap/src/adapters/job/prompts/curator-reconcile-instructions.ts';
import { RUBRIC } from '../../tab-recap/src/adapters/job/prompts/rubric.ts';
import type { Curated, CuratorMode, Curators } from '../../packages/session-ledger/src/ports/curators.ts';
import type { Stories } from '../../packages/session-ledger/src/ports/stories.ts';
import { unknown as unknownResult } from '../../packages/session-ledger/src/ports/unknowable.ts';
import type { RepairMode } from '../../packages/session-ledger/src/recap/application/job-kit/repair.ts';
import { reconcileTask } from '../../packages/session-ledger/src/recap/application/ledger-reconcile.ts';
import { plainOf, type ArmCounters } from '../lib/arm.ts';
import { joinedCalled, type ArmedAnswer, type ArmRecord, type Asker, type Rounded } from '../lib/runner.ts';
import type { Called, Item } from '../lib/types.ts';
import { unparsedOf } from '../lib/unparsed.ts';
import type { ReconcileItem } from './prompt.ts';
import { checkedOf, wrongCloses } from './scoring.ts';
import { textOf } from '../../packages/session-ledger/src/recap/domain/text.ts';
import { instant } from '../../packages/session-ledger/src/recap/domain/time.ts';
import { causeOf } from '../../packages/session-ledger/src/recap/domain/failure-cause.ts';
import { tabIdOf } from '../../packages/session-ledger/src/recap/domain/lane-shape.ts';

// One job of the reconcile eval, driven through the plugin's own reconcileTask.
// The writer sends each call through the runner's asker, so every call shares the job's pool slot, backoff and call cap.
export function reconcileRound(mode: RepairMode): (raw: Item, ask: Asker) => Promise<Rounded> {
    return async (raw, ask) => {
        const item = raw as ReconcileItem;
        const calls: Called[] = [];
        const lines: string[] = [];
        let applied = 0;
        const writer: Curators = {
            backend: textOf('eval'),
            write: async (document: string, kind?: CuratorMode): Promise<Curated> => {
                const done = await ask({ system: kind === 'reconcile' ? RECONCILE_CURATOR_INSTRUCTIONS : CURATOR_INSTRUCTIONS, user: document });
                calls.push(done);
                if (done.failure_kind !== null || done.text === null) return unknownResult({ why: 'unreachable', detail: causeOf(textOf(`${done.failure_kind} ${done.failure_detail ?? ''}`)) });
                return { kind: 'curated', text: textOf(done.text) };
            },
        };
        const stories: Stories = {
            read: () => null,
            keep: (_run, change) => {
                applied += change.reconciled?.length ?? 0;
                return { changed: [], refused: [] };
            },
        };
        await reconcileTask(
            { writer, stories, language: textOf(item.input.language), rubric: RUBRIC.items, clock: { now: instant(item.input.clock.now), zone: textOf(item.input.clock.zone) }, repair: () => mode, log: (line: string): void => { lines.push(line); } },
            { tab: tabIdOf('t'), key: textOf('k'), name: textOf(item.input.name), facts: item.input.open, tail: item.input.tail, agents: [textOf('claude'), textOf(item.input.name.toLowerCase())] },
        );
        const repairs = lines.filter((line) => line.includes(': reconcile repair — ')).length;
        const repairFailed = lines.some((line) => line.includes('gave no repair (') || line.includes('reconcile repair refused — the answer is not JSON'));
        const final = calls.length === 2 && !repairFailed ? (calls[1]?.text ?? null) : (calls[0]?.text ?? null);
        const arm: ArmRecord = { mode, repair_calls: repairs, repair_input_tokens: calls[1]?.input_tokens ?? 0, repair_output_tokens: calls[1]?.output_tokens ?? 0, applied_ops: applied };
        return { called: joinedCalled(calls, final), arm };
    };
}

// Counters per configuration over the rows of one arm run, read the way the daemon reads them.
export function reconcileCounters(items: readonly ReconcileItem[], rows: readonly ArmedAnswer[], configs: readonly string[], mode: string): ArmCounters[] {
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
            if (unparsedOf('curator-reconcile', text, 'p0')) {
                unparsed += 1;
                continue;
            }
            const item = byId.get(row.id) as ReconcileItem;
            const found = checkedOf(item, plainOf(text));
            if (found === null) {
                unparsed += 1;
                continue;
            }
            wrongful += wrongCloses(item, found.kept).length;
            refused += found.parserRefused.length + found.gateRefused.length;
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
