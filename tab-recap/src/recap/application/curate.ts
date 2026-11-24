import { fallbackLedger, isUnknownRead, type GuardedLedger, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { SessionCursor } from '#src/ports/recap-records.ts';
import type { CurationRun } from '#src/ports/stories.ts';
import { curationOf } from '#src/recap/domain/curation.ts';
import type { Fact, FactId } from '#src/recap/domain/fact.ts';
import type { CloseOp } from '#src/recap/domain/ops.ts';
import { parseText, parseTextOrNull, textOf } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { curatorInput } from '@stateforge-labs/session-ledger/unstable/recap/application/curator-input.ts';
import { newestChange } from './expanded-view.ts';
import { Reconciling } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-reconcile.ts';
import { storyAnswerOf } from './job-kit/story-repair.ts';
import type { StoryReading } from './job-kit/story-repair.ts';
import { answerTextOf } from '@stateforge-labs/session-ledger/unstable/recap/application/recap-shape.ts';
import type { CurateWhy, ReconcilingDeps, RecapWritten } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-reconcile.ts';
import { factIdOf } from '#src/recap/domain/fact.ts';

export type { CurateWhy, RecapWritten };

export const CURATE_GAP_MS = 5 * 60_000;

interface CurateScope { readonly lanes: readonly SessionCursor[]; readonly why: CurateWhy }

export interface CurateDeps extends Omit<ReconcilingDeps, 'ledger'> {
    readonly records: GuardedRecapRecords;
    readonly ledger: GuardedLedger;
}

export class CurateTasks {
    private readonly deps: CurateDeps;
    private readonly lastRun = new Map<Text, Instant>();
    private readonly running = new Set<Text>();
    private readonly reconciling: Reconciling;
    private readonly plain: ReconcilingDeps;

    constructor(deps: CurateDeps) {
        this.deps = deps;
        this.plain = { ...deps, ledger: fallbackLedger(deps.ledger, (failure) => deps.log(must(parseText(`curate: facts not read, ${saying(failure.why)}`)))) };
        this.reconciling = new Reconciling(this.plain);
    }

    async afterRun(event: RecapWritten): Promise<void> {
        const tab = parseTabId(event.tab);
        if (tab.kind === 'ok' && this.reconciling.due(event)) {
            await this.run(tab.value, event.boundary ? 'boundary' : 'turns');
        }
    }

    async run(tab: ScopeId, why: CurateWhy = 'open'): Promise<void> {
        const recap = this.deps.records.readRecap(tab);
        if (isUnknownRead(recap)) {
            return;
        }
        const done: Presence[] = [];
        for (const task of recap?.tasks ?? []) {
            done.push(await this.one(tab, task, { lanes: recap?.sessions ?? [], why }));
        }
        if (done.includes('present')) {
            this.reconciling.settle(tab);
        }
    }

    private async one(tab: ScopeId, task: RecapTask, how: CurateScope): Promise<Presence> {
        try {
            const reconciled = await this.reconciling.task(tab, { id: must(parseText(task.id)), name: must(parseText(task.name)), lanes: task.sessions.map((member) => member) }, how.lanes, how.why);
            if (how.why === 'open') {
                await this.curate(tab, task);
            }
            return reconciled ? 'present' : 'absent';
        } catch (error) {
            this.deps.log(must(parseText(`curator ${tab} ${task.id}: ${error instanceof Error ? error.message : String(error)}`)));
            return 'absent';
        }
    }

    private due(key: Text, facts: readonly Fact[], storyAt: Instant | null, now: Instant): Presence {
        const change = newestChange(facts);
        const last = this.lastRun.get(key);
        const due = change !== null && (storyAt === null || storyAt < change) && !this.running.has(key) && (last === undefined || now - last >= CURATE_GAP_MS);
        return due ? 'present' : 'absent';
    }

    private async curate(tab: ScopeId, task: RecapTask): Promise<void> {
        const { deps } = this;
        const [key, now] = [must(parseText(`${tab}\u0000${task.id}`)), deps.clock()];
        const facts = deps.ledger.allOf({ scope: tab, key: task.id });
        if (isUnknownRead(facts)) {
            return;
        }
        const writer = deps.writer();
        const storyAt = deps.stories.read(tab, task.id)?.at;
        if (writer === null || this.due(key, facts, storyAt === undefined ? null : storyAt, now) === 'absent') {
            return;
        }
        this.lastRun.set(key, now);
        this.running.add(key);
        try {
            const { document, facts: named } = curatorInput({ name: must(parseText(task.name)), language: must(parseText(deps.language())), rubric: must(parseText(deps.rubric)), facts, clock: { now, zone: must(parseText(deps.zone())) } });
            const answered = await writer.write(document);
            if (isUnknown(answered)) {
                deps.log(must(parseText(`curator ${tab} ${task.id}: ${writer.backend} gave none (${saying(answered.why)})`)));
                return;
            }
            const run: CurationRun = { task: { scope: tab, key: task.id }, at: now, language: deps.language() };
            const reading: StoryReading = (answer) => {
                const open = new Set<FactId>();
                for (const [id, fact] of named) {
                    if (fact.state === 'open') {
                        open.add(factIdOf(id));
                    }
                }
                const text = answer.kind === 'curated' ? answer.text : '';
                const read = parseText(text);
                return curationOf(read.kind === 'ok' ? answerTextOf(read.value) : textOf(text), open);
            };
            const kept = await storyAnswerOf(this.plain, { writer, run, sent: parseText(document), first: answered, reading });
            this.store(run, must(parseText(kept.kind === 'curated' ? kept.text : answered.text)), named);
        } finally {
            this.running.delete(key);
        }
    }

    private store(run: CurationRun, answer: Text, named: ReadonlyMap<string, Fact>): void {
        const [open, where] = [new Set([...named].filter(([, fact]) => fact.state === 'open').map(([id]) => factIdOf(id))), `curator ${run.task.scope} ${run.task.key}`];
        const checked = curationOf(answerTextOf(answer), open);
        checked.refused.forEach((why) => { this.deps.log(must(parseText(`${where}: refused — ${why}`))); });
        const merges = checked.merges.map((merge): CloseOp => ({ op: 'close', id: named.get(merge.id)?.id ?? factIdOf(''), why: 'merged' }));
        const applied = this.deps.stories.keep(run, { story: parseTextOrNull(checked.story), merges });
        applied.refused.forEach((one) => { this.deps.log(must(parseText(`${where}: the ledger refused ${one.op.op} — ${one.reason}`))); });
        if (checked.story === null) {
            this.deps.log(must(parseText(`${where}: no paragraph in the answer; the old one stays`)));
        }
    }
}
