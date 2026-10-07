// The curator job: for each task of a tab whose ledger changed since its story was written, one model call that may close
// duplicates as merged and writes the "session so far" paragraph. At most once per five minutes per task; never in the
// view's way (the view asks through the request queue and redraws from the store).
import type { Curators } from '#src/ports/curators.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { CurationRun, Stories } from '#src/ports/stories.ts';
import { curationOf } from '#src/recap/domain/curation.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { CloseOp } from '#src/recap/domain/ops.ts';
import { curatorInput } from './curator-input.ts';
import { newestChange } from './expanded-view.ts';

/** a task is curated at most this often */
export const CURATE_GAP_MS = 5 * 60_000;

export interface CurateDeps {
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly stories: Stories;
    /** the curator as the job is set now; null when it is off or no harness is there */
    readonly writer: () => Curators | null;
    readonly clock: () => number;
    readonly zone: () => string;
    /** the language the paragraph is written in */
    readonly language: () => string;
    /** the rubric's item checks the curator is shown */
    readonly rubric: string;
    log(line: string): void;
}

export class Curate {
    private readonly deps: CurateDeps;
    private readonly lastRun = new Map<string, number>();
    private readonly running = new Set<string>();

    constructor(deps: CurateDeps) {
        this.deps = deps;
    }

    /** Every task of the tab, one after the other; a task that cannot be curated is logged and the next goes on. */
    async run(tab: string): Promise<void> {
        for (const task of this.deps.records.readRecap(tab)?.tasks ?? []) {
            try {
                await this.curate(tab, task);
            } catch (error) {
                this.deps.log(`curator ${tab} ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /** Whether the task is worth a call now: it has facts, its story is older than them, and it was not curated lately. */
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

    /** Check the answer, map its ids back to facts, and keep the story with the merges in one transaction. */
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
