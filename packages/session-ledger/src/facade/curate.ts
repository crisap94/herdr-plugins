import type { CurationRun, EnginePlugs, Stories } from '#src/contract/engine.ts';
import type { Fact, TaskId } from '#src/contract/facts.ts';
import type { ScopeId } from '#src/contract/ids.ts';
import type { Instant, Text } from '#src/contract/kernel.ts';
import type { Curator } from '#src/contract/models.ts';
import type { RecapTask } from '#src/contract/records.ts';
import { curatorInput } from '#src/recap/application/curator-input.ts';
import { answerTextOf } from '#src/recap/application/recap-shape.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { parseText } from '#src/recap/domain/text.ts';

const CURATE_GAP_MS = 5 * 60_000;

const STORY_WORDS = 120;

interface Round {
    readonly plugs: EnginePlugs;
    readonly curator: Curator;
    readonly stories: Stories;
    readonly scope: ScopeId;
    readonly task: RecapTask;
}

interface Marks {
    readonly lastRun: Map<Text, Instant>;
    readonly running: Set<Text>;
}

const taskIdOf = (round: Round): TaskId => ({ tab: round.scope, key: round.task.id });

const markOf = (round: Round): Text | null => {
    const mark = parseText(`${round.scope}\u0000${round.task.id}`);
    return mark.kind === 'ok' ? mark.value : null;
};

const storyIn = (answer: Text): Text | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(answerTextOf(answer));
    } catch {
        return null;
    }
    const said: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'story') : null;
    const words = typeof said === 'string' ? said.split(/\s+/u).filter((word) => word !== '') : [];
    const story = parseText(words.join(' '));
    return words.length === 0 || words.length > STORY_WORDS || story.kind === 'err' ? null : story.value;
};

const keep = (round: Round, run: CurationRun, answer: Text): void => {
    const { environment } = round.plugs;
    const where = `curator ${round.scope} ${round.task.id}`;
    const story = storyIn(answer);
    const applied = round.stories.keep(run, { story, merges: [] });
    applied.refused.forEach((one) => { environment.log(brand<string, 'Text'>(`${where}: the ledger refused ${one.op.op} — ${one.reason}`)); });
    if (story === null) {
        environment.log(brand<string, 'Text'>(`${where}: no paragraph in the answer; the old one stays`));
    }
};

const ask = async (round: Round, run: CurationRun, document: Text): Promise<void> => {
    const where = `curator ${round.scope} ${round.task.id}`;
    try {
        const answered = await round.curator.write(document, 'story');
        const text = answered.kind === 'curated' ? parseText(answered.text) : null;
        if (text === null || text.kind === 'err') {
            round.plugs.environment.log(brand<string, 'Text'>(`${where}: ${round.curator.backend} gave none`));
            return;
        }
        keep(round, run, text.value);
    } catch (error) {
        round.plugs.environment.log(brand<string, 'Text'>(`${where}: ${error instanceof Error ? error.message : String(error)}`));
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
        plugs.environment.log(brand<string, 'Text'>(`curator ${round.scope} ${round.task.id}: the facts could not be read`));
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
        const { document } = curatorInput({ name: round.task.name, language: language.value, rubric: plugs.settings.rubric?.() ?? '', facts, clock: { now, zone } });
        const sent = parseText(document);
        if (sent.kind === 'ok') {
            await ask(round, { task, at: now, language: language.value }, sent.value);
        }
    } finally {
        marks.running.delete(key);
    }
};

export function curate(plugs: EnginePlugs): (scope: ScopeId) => Promise<void> {
    const marks: Marks = { lastRun: new Map(), running: new Set() };
    return async (scope) => {
        const curator = plugs.models.curator?.() ?? null;
        const { stories } = plugs.store;
        if (curator === null || stories === undefined) {
            return;
        }
        const recap = plugs.store.records.readRecap(scope);
        if (recap !== null && 'kind' in recap) {
            plugs.environment.log(brand<string, 'Text'>(`curator ${scope}: the recap could not be read`));
            return;
        }
        for (const task of recap?.tasks ?? []) {
            await curateTask({ plugs, curator, stories, scope, task }, marks);
        }
    };
}
