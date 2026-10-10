import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { LaneCursor, RecapRecords } from '#src/ports/recap-records.ts';
import type { CurationRun } from '#src/ports/stories.ts';
import { curationOf } from '#src/recap/domain/curation.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { CloseOp } from '#src/recap/domain/ops.ts';
import { curatorInput } from './curator-input.ts';
import { newestChange } from './expanded-view.ts';
import { Reconciling } from './ledger-reconcile.ts';
import type { CurateWhy, ReconcilingDeps, RunEvent } from './ledger-reconcile.ts';

export type { CurateWhy, RunEvent };

export const CURATE_GAP_MS = 5 * 60_000;

export interface CurateDeps extends ReconcilingDeps {
    readonly records: RecapRecords;
}

export class Curate {
    private readonly deps: CurateDeps;
    private readonly lastRun = new Map<string, number>();
    private readonly running = new Set<string>();
    private readonly reconciling: Reconciling;

    constructor(deps: CurateDeps) {
        this.deps = deps;
        this.reconciling = new Reconciling(deps);
    }

    async afterRun(event: RunEvent): Promise<void> {
        if (this.reconciling.due(event)) {
            await this.run(event.tab, event.boundary ? 'boundary' : 'turns');
        }
    }

    async run(tab: string, why: CurateWhy = 'open'): Promise<void> {
        const recap = this.deps.records.readRecap(tab);
        const done: boolean[] = [];
        for (const task of recap?.tasks ?? []) {
            done.push(await this.one(tab, task, { lanes: recap?.lanes ?? [], why }));
        }
        if (done.some((each) => each)) {
            this.reconciling.settle(tab);
        }
    }

    private async one(tab: string, task: { readonly id: string; readonly name: string; readonly lanes: readonly string[] }, how: { readonly lanes: readonly LaneCursor[]; readonly why: CurateWhy }): Promise<boolean> {
        try {
            const reconciled = await this.reconciling.task(tab, task, how.lanes, how.why);
            if (how.why === 'open') {
                await this.curate(tab, task);
            }
            return reconciled;
        } catch (error) {
            this.deps.log(`curator ${tab} ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private due(key: string, facts: readonly Fact[], storyAt: number | null, now: number): boolean {
        const change = newestChange(facts);
        const last = this.lastRun.get(key);
        return change !== null && (storyAt === null || storyAt < change) && !this.running.has(key) && (last === undefined || now - last >= CURATE_GAP_MS);
    }

    private async curate(tab: string, task: { readonly id: string; readonly name: string }): Promise<void> {
        const { deps } = this;
        const [key, now] = [`${tab}\u0000${task.id}`, deps.clock()];
        const facts = deps.ledger.allOf({ tab, key: task.id });
        const writer = deps.writer();
        if (writer === null || !this.due(key, facts, deps.stories.read(tab, task.id)?.at ?? null, now)) {
            return;
        }
        this.lastRun.set(key, now);
        this.running.add(key);
        try {
            const { document, facts: named } = curatorInput({ name: task.name, language: deps.language(), rubric: deps.rubric, facts, clock: { now, zone: deps.zone() } });
            const answered = await writer.write(document);
            if (isUnknown(answered)) {
                deps.log(`curator ${tab} ${task.id}: ${writer.backend} gave none (${saying(answered.why)})`);
                return;
            }
            this.store({ task: { tab, key: task.id }, at: now, language: deps.language() }, answered.text, named);
        } finally {
            this.running.delete(key);
        }
    }

    private store(run: CurationRun, answer: string, named: ReadonlyMap<string, Fact>): void {
        const [open, where] = [new Set([...named].filter(([, fact]) => fact.state === 'open').map(([id]) => id)), `curator ${run.task.tab} ${run.task.key}`];
        const checked = curationOf(answer, open);
        checked.refused.forEach((why) => { this.deps.log(`${where}: refused — ${why}`); });
        const merges = checked.merges.map((merge): CloseOp => ({ op: 'close', id: named.get(merge.id)?.id ?? '', why: 'merged' }));
        const applied = this.deps.stories.keep(run, { story: checked.story, merges });
        applied.refused.forEach((one) => { this.deps.log(`${where}: the ledger refused ${one.op.op} — ${one.reason}`); });
        if (checked.story === null) {
            this.deps.log(`${where}: no paragraph in the answer; the old one stays`);
        }
    }
}
