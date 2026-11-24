import type { CurationRun, EnginePlugs, KeptStory, Stories, StoryChange } from '#src/contract/engine.ts';
import type { Applied, CloseOp, Fact, TaskId } from '#src/contract/facts.ts';
import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { Instant, Text } from '#src/contract/kernel.ts';
import type { Curated, Curator } from '#src/contract/models.ts';
import type { SessionCursor } from '#src/ports/recap-records.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import type { Stories as LedgerStories } from '#src/ports/stories.ts';
import { curatorInput } from '#src/recap/application/curator-input.ts';
import type { CurateWhy, RecapWritten } from '#src/recap/application/ledger-reconcile.ts';
import { answerTextOf } from '#src/recap/application/recap-shape.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import { curationOf, type Curation } from './curation.ts';
import type { CurateBridge, Reconcile, Reconciled, Round } from './reconcile-bridge.ts';
import { reconcilingOver } from './reconcile-bridge.ts';
import { acceptedRepair, storyRepair, type StoryReading } from './story-repair.ts';
import { tabIdOf } from '#src/recap/domain/lane-shape.ts';

const CURATE_GAP_MS = 5 * 60_000;

interface ScopeRound {
    readonly plugs: EnginePlugs;
    readonly curator: Curator;
    readonly stories: Stories;
    readonly scope: ScopeId;
}

interface Marks {
    readonly lastRun: Map<Text, Instant>;
    readonly running: Set<Text>;
}

type Named = ReadonlyMap<Text, Fact>;

interface Sent {
    readonly document: Text;
    readonly named: Named;
}

interface Asked extends Sent {
    readonly first: Curated;
}

const note = brand<string, 'Text'>;

const taskOn = (scope: ScopeId, key: SessionKey): TaskId => ({ scope: tabIdOf(scope), key: textOf(key) });

const storiesOver = (stories: Stories): LedgerStories => ({
    read: (tab: ScopeId, task: Text): KeptStory | null => stories.read(taskOn(brand<string, 'ScopeId'>(tab), brand<string, 'SessionKey'>(task))),
    keep: (run: CurationRun, change: StoryChange): Applied => stories.keep(run, change),
});

const taskIdOf = (round: Round): TaskId => taskOn(round.scope, brand<string, 'SessionKey'>(round.task.id));

const markOf = (round: Round): Text | null => {
    const mark = parseText(`${round.scope}\u0000${round.task.id}`);
    return mark.kind === 'ok' ? mark.value : null;
};

const lineOf = (round: Round, what: Text): Text => note(`curator ${round.scope} ${round.task.id}: ${what}`);

const namedOpen = (named: Named): ReadonlySet<Text> => new Set([...named].filter(([, fact]) => fact.state === 'open').map(([id]) => id));

const curationOfAnswer = (answer: Curated, open: ReadonlySet<Text>): Curation => {
    const read = parseText(answer.kind === 'curated' ? answer.text : '');
    return curationOf(read.kind === 'ok' ? must(parseText(answerTextOf(read.value))) : note(''), open);
};

const keep = (round: Round, run: CurationRun, answer: Text, named: Named): void => {
    const { environment } = round.plugs;
    const checked = curationOf(must(parseText(answerTextOf(answer))), namedOpen(named));
    checked.refused.forEach((why) => { environment.log(lineOf(round, note(`refused — ${why}`))); });
    const merges = checked.merges.map((merge): CloseOp => ({ op: 'close', id: named.get(merge.id)?.id ?? brand<string, 'FactId'>(''), why: 'merged' }));
    const applied = round.stories.keep(run, { story: checked.story, merges });
    applied.refused.forEach((one) => { environment.log(lineOf(round, note(`the ledger refused ${one.op.op} — ${one.reason}`))); });
    if (checked.story === null) {
        environment.log(lineOf(round, note('no paragraph in the answer; the old one stays')));
    }
};

const repaired = async (round: Round, asked: Asked): Promise<Curated> => {
    const { first, document, named } = asked;
    if (round.plugs.settings.storyRepair?.() !== 'once' || first.kind !== 'curated') {
        return first;
    }
    const open = namedOpen(named);
    const reading: StoryReading = (answer) => curationOfAnswer(answer, open);
    const checked = reading(first);
    if (checked.refused.length === 0 && checked.story !== null) {
        return first;
    }
    round.plugs.environment.log(lineOf(round, note(`story repair — ${checked.refused.length} refused`)));
    const said = parseText(first.text);
    return said.kind === 'err' ? first : acceptedRepair(first, await round.curator.write(storyRepair(document, said.value, checked), 'story'), reading);
};

const ask = async (round: Round, run: CurationRun, sent: Sent): Promise<void> => {
    try {
        const answered = await round.curator.write(sent.document, 'story');
        if (isUnknown(answered)) {
            round.plugs.environment.log(lineOf(round, note(`${round.curator.backend} gave none (${saying(answered.why)})`)));
            return;
        }
        const kept = await repaired(round, { ...sent, first: answered });
        keep(round, run, must(parseText(kept.kind === 'curated' ? kept.text : answered.text)), sent.named);
    } catch (error) {
        round.plugs.environment.log(lineOf(round, note(error instanceof Error ? error.message : String(error))));
    }
};

const changedTask = (round: Round, facts: readonly Fact[]): TaskId | null => {
    const task = taskIdOf(round);
    const change = Math.max(...facts.map((fact) => Math.max(fact.lastAt, fact.closedAt ?? 0)));
    const storyAt = round.stories.read(task)?.at ?? null;
    return facts.length === 0 || (storyAt !== null && storyAt >= change) ? null : task;
};

const dueTask = (round: Round, marks: Marks, facts: readonly Fact[], now: Instant): TaskId | null => {
    const key = markOf(round);
    const last = key === null ? undefined : marks.lastRun.get(key);
    const waiting = key === null || marks.running.has(key) || (last !== undefined && now - last < CURATE_GAP_MS);
    return waiting ? null : changedTask(round, facts);
};

const curateTask = async (round: Round, marks: Marks): Promise<void> => {
    const { plugs } = round;
    const now = plugs.environment.clock.now();
    const facts = plugs.store.facts.allOf(taskIdOf(round));
    const language = parseText(plugs.settings.language());
    if ('kind' in facts || language.kind === 'err') {
        plugs.environment.log(lineOf(round, note('the facts could not be read')));
        return;
    }
    const task = dueTask(round, marks, facts, now);
    const key = markOf(round);
    if (task === null || key === null) {
        return;
    }
    marks.lastRun.set(key, now);
    marks.running.add(key);
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { document, facts: described } = curatorInput({ name: note(round.task.name), language: note(language.value), rubric: note(plugs.settings.rubric?.() ?? ''), facts, clock: { now, zone: note(zone) } });
        const sent = parseText(document);
        if (sent.kind === 'ok') {
            await ask(round, { task, at: now, language: language.value }, { document: sent.value, named: new Map([...described].map(([id, fact]) => [note(id), fact] as const)) });
        }
    } finally {
        marks.running.delete(key);
    }
};

const oneTask = async (round: Round, marks: Marks, reconciling: Reconcile, lanes: readonly SessionCursor[]): Promise<Reconciled> => {
    try {
        const reconciled = await reconciling.task(round, lanes, 'open');
        await curateTask(round, marks);
        return reconciled;
    } catch (error) {
        round.plugs.environment.log(lineOf(round, note(error instanceof Error ? error.message : String(error))));
        return 'unchanged';
    }
};

const curateScope = async (round: ScopeRound, marks: Marks, reconciling: Reconcile): Promise<void> => {
    const { plugs, curator, stories, scope } = round;
    const recap = plugs.store.records.readRecap(scope);
    if (recap !== null && 'kind' in recap) {
        plugs.environment.log(note(`curator ${scope}: the recap could not be read`));
        return;
    }
    const done: Reconciled[] = [];
    for (const task of recap?.tasks ?? []) {
        done.push(await oneTask({ plugs, curator, stories, scope, task }, marks, reconciling, recap?.sessions ?? []));
    }
    if (done.includes('reconciled')) {
        reconciling.settle(scope);
    }
};

const reconcileScope = async (round: ScopeRound, why: CurateWhy, reconciling: Reconcile): Promise<void> => {
    const { plugs, scope } = round;
    const recap = plugs.store.records.readRecap(scope);
    if (recap === null || 'kind' in recap) {
        return;
    }
    const done: Reconciled[] = [];
    for (const task of recap.tasks) {
        try {
            done.push(await reconciling.task({ ...round, task }, recap.sessions, why));
        } catch (error) {
            plugs.environment.log(lineOf({ ...round, task }, note(error instanceof Error ? error.message : String(error))));
        }
    }
    if (done.includes('reconciled')) {
        reconciling.settle(scope);
    }
};

export interface Curating {
    readonly request: (scope: ScopeId) => Promise<void>;
    readonly afterRun: (scope: ScopeId, event: RecapWritten) => Promise<void>;
}

export function curate(plugs: EnginePlugs, bridge: CurateBridge): Curating {
    const marks: Marks = { lastRun: new Map(), running: new Set() };
    const { stories } = plugs.store;
    const reconciling = stories === undefined ? null : reconcilingOver(plugs, bridge, storiesOver(stories));
    return {
        request: async (scope) => {
            const curator = plugs.models.curator?.() ?? null;
            if (curator !== null && stories !== undefined && reconciling !== null) {
                await curateScope({ plugs, curator, stories, scope }, marks, reconciling);
            }
        },
        afterRun: async (scope, event) => {
            const curator = plugs.models.curator?.() ?? null;
            if (plugs.settings.reconcileEvery === undefined || curator === null || stories === undefined || reconciling === null) {
                return;
            }
            if (reconciling.due(event) === 'due') {
                await reconcileScope({ plugs, curator, stories, scope }, event.boundary ? 'boundary' : 'turns', reconciling);
            }
        },
    };
}
