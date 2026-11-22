import type { CurationRun, EnginePlugs, KeptStory, Stories, StoryChange } from '#src/contract/engine.ts';
import type { Applied, CloseOp, Fact, TaskId } from '#src/contract/facts.ts';
import type { ScopeId, SessionKey } from '#src/contract/ids.ts';
import type { Count, Instant, Text } from '#src/contract/kernel.ts';
import type { Curated, Curator } from '#src/contract/models.ts';
import type { RecapTask } from '#src/contract/records.ts';
import type { CheckedLedger, Ledger } from '#src/ports/ledger.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { Stories as LedgerStories } from '#src/ports/stories.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { UNREAD, type Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying, type Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { curatorInput } from '#src/recap/application/curator-input.ts';
import { Reconciling, type ReconcilingDeps } from '#src/recap/application/ledger-reconcile.ts';
import { answerTextOf } from '#src/recap/application/recap-shape.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { curationOf, type Curation } from './curation.ts';
import { acceptedRepair, storyRepair, type StoryReading } from './story-repair.ts';

const CURATE_GAP_MS = 5 * 60_000;

const TAIL_BYTES = 256 * 1024;

export interface CurateBridge {
    readonly ledger: CheckedLedger;
    readonly readers: TranscriptRegistry;
}

interface Round {
    readonly plugs: EnginePlugs;
    readonly curator: Curator;
    readonly stories: Stories;
    readonly scope: ScopeId;
    readonly task: RecapTask;
}

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

type Reconciled = 'reconciled' | 'unchanged';

interface Reconcile {
    task(round: Round, lanes: readonly LaneCursor[]): Promise<Reconciled>;
    settle(scope: ScopeId): void;
}

interface Sent {
    readonly document: Text;
    readonly named: Named;
}

interface Asked extends Sent {
    readonly first: Curated;
}

const note = brand<string, 'Text'>;

const count = brand<number, 'Count'>;

const taskOn = (scope: ScopeId, key: SessionKey): TaskId => ({ tab: scope, key });

const taskIdOf = (round: Round): TaskId => taskOn(round.scope, brand<string, 'SessionKey'>(round.task.id));

const markOf = (round: Round): Text | null => {
    const mark = parseText(`${round.scope}\u0000${round.task.id}`);
    return mark.kind === 'ok' ? mark.value : null;
};

const lineOf = (round: Round, what: Text): Text => note(`curator ${round.scope} ${round.task.id}: ${what}`);

const byTime = (a: Entry, b: Entry): Count => count((a.at ?? 0) - (b.at ?? 0));

const tailOf = (readers: TranscriptRegistry) => async (lanes: readonly LaneCursor[]): Promise<readonly Entry[]> => {
    const read = await Promise.all(lanes.filter((seat) => seat.transcript !== '').map(async (seat) => {
        const reader = readers.readerFor(seat.agent);
        const chunk = reader === undefined ? null : await reader.read(seat.transcript, UNREAD, TAIL_BYTES);
        return chunk === null || isUnknown(chunk) ? [] : chunk.entries;
    }));
    return read.flat().toSorted(byTime);
};

const storiesOver = (stories: Stories): LedgerStories => ({
    read: (scope: ScopeId, key: SessionKey): KeptStory | null => stories.read(taskOn(scope, key)),
    keep: (run: CurationRun, change: StoryChange): Applied => stories.keep(run, change),
});

const plainLedger = (ledger: CheckedLedger, log: (line: Text) => void): Ledger => {
    const skipped = (found: readonly Fact[] | Unknown): readonly Fact[] => {
        if ('kind' in found) {
            log(note(`curate: facts not read, ${saying(found.why)}`));
            return [];
        }
        return found;
    };
    return {
        ...ledger,
        openOf: (task: TaskId) => { const found = ledger.openOf(task); return 'kind' in found ? [] : found; },
        recentlyClosed: (task: TaskId, sinceMs: Instant) => { const found = ledger.recentlyClosed(task, sinceMs); return 'kind' in found ? [] : found; },
        allOf: (task: TaskId) => skipped(ledger.allOf(task)),
        keysOf: (scope: ScopeId): readonly Text[] => { const found = ledger.keysOf(scope); return 'kind' in found ? [] : found.map((key) => note(key)); },
    };
};

const reconcilingOver = (plugs: EnginePlugs, bridge: CurateBridge, stories: Stories): Reconcile => {
    const { environment, settings, models } = plugs;
    const log = (line: Text): void => { environment.log(line); };
    const deps: ReconcilingDeps = {
        ledger: plainLedger(bridge.ledger, log),
        stories: storiesOver(stories),
        writer: () => models.curator?.() ?? null,
        clock: () => environment.clock.now(),
        zone: (): Text => note(Intl.DateTimeFormat().resolvedOptions().timeZone),
        language: () => settings.language(),
        get rubric(): Text { return settings.rubric?.() ?? note(''); },
        tail: tailOf(bridge.readers),
        repair: () => settings.storyRepair?.() ?? 'off',
        log: (line: Text): void => { log(line); },
    };
    const reconciling = new Reconciling(deps);
    return {
        task: async (round: Round, lanes: readonly LaneCursor[]): Promise<Reconciled> => ((await reconciling.task(round.scope, round.task, lanes, 'open')) ? 'reconciled' : 'unchanged'),
        settle: (scope: ScopeId): void => { reconciling.settle(scope); },
    };
};

const namedOpen = (named: Named): ReadonlySet<Text> => new Set([...named].filter(([, fact]) => fact.state === 'open').map(([id]) => id));

const curationOfAnswer = (answer: Curated, open: ReadonlySet<Text>): Curation => {
    const read = parseText(answer.kind === 'curated' ? answer.text : '');
    return curationOf(read.kind === 'ok' ? must(parseText(answerTextOf(read.value))) : note(''), open);
};

const keep = (round: Round, run: CurationRun, answer: Text, named: Named): void => {
    const { environment } = round.plugs;
    const checked = curationOf(must(parseText(answerTextOf(answer))), namedOpen(named));
    checked.refused.forEach((why) => { environment.log(lineOf(round, note(`refused — ${why}`))); });
    const merges = checked.merges.map((merge): CloseOp => ({ op: 'close', id: named.get(merge.id)?.id ?? '', why: 'merged' }));
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
        const { document, facts: described } = curatorInput({ name: round.task.name, language: language.value, rubric: plugs.settings.rubric?.() ?? '', facts, clock: { now, zone } });
        const sent = parseText(document);
        if (sent.kind === 'ok') {
            await ask(round, { task, at: now, language: language.value }, { document: sent.value, named: new Map([...described].map(([id, fact]) => [note(id), fact] as const)) });
        }
    } finally {
        marks.running.delete(key);
    }
};

const oneTask = async (round: Round, marks: Marks, reconciling: Reconcile, lanes: readonly LaneCursor[]): Promise<Reconciled> => {
    try {
        const reconciled = await reconciling.task(round, lanes);
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
        done.push(await oneTask({ plugs, curator, stories, scope, task }, marks, reconciling, recap?.lanes ?? []));
    }
    if (done.includes('reconciled')) {
        reconciling.settle(scope);
    }
};

export function curate(plugs: EnginePlugs, bridge: CurateBridge): (scope: ScopeId) => Promise<void> {
    const marks: Marks = { lastRun: new Map(), running: new Set() };
    const { stories } = plugs.store;
    const reconciling = stories === undefined ? null : reconcilingOver(plugs, bridge, stories);
    return async (scope) => {
        const curator = plugs.models.curator?.() ?? null;
        if (curator !== null && stories !== undefined && reconciling !== null) {
            await curateScope({ plugs, curator, stories, scope }, marks, reconciling);
        }
    };
}
