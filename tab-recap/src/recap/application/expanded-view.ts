import type { Boundaries } from '#src/ports/boundaries.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LaneCursor, RecapRecords } from '#src/ports/recap-records.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { SessionSource } from '#src/ports/session-source.ts';
import type { Stories } from '#src/ports/stories.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { AutocompactRecords } from '#src/ports/autocompact-records.ts';
import { sessionFactsOf } from '#src/recap/domain/session-facts.ts';
import type { ExpandedTask, ExpandedView } from '#src/recap/render/expanded.ts';
import type { FileCount } from './edit-counts.ts';

export const CURATING_MS = 10 * 60_000;
const LABEL_CHARS = 20;

export interface ExpandedDeps {
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly stories: Stories;
    readonly session: SessionSource;
    readonly autocompact?: Pick<AutocompactRecords, 'countsFor'>;
    readonly boundaries: Pick<Boundaries, 'breaksOf' | 'chapterCount'>;
    readonly requests: Pick<Requests, 'requestCurate'>;
    readonly edits: (lanes: readonly LaneCursor[], now: number) => readonly FileCount[];
}

export type ExpandedData = Pick<ExpandedView, 'tasks' | 'session' | 'webs' | 'breaks'>;

export const newestChange = (facts: readonly Fact[]): number | null =>
    facts.length === 0 ? null : Math.max(...facts.map((fact) => Math.max(fact.lastAt, fact.closedAt ?? 0)));

const clipped = (label: string | null): string | null => (label === null || label.length <= LABEL_CHARS ? label : `${label.slice(0, LABEL_CHARS - 1)}…`);

export class ExpandedModel {
    private readonly deps: ExpandedDeps;
    private readonly asked = new Map<string, { readonly change: number; readonly at: number }>();

    constructor(deps: ExpandedDeps) {
        this.deps = deps;
    }

    private taskOf(tab: string, task: { readonly id: string; readonly name: string }, now: number): { readonly task: ExpandedTask; readonly asks: boolean } {
        const facts = this.deps.ledger.allOf({ tab, key: task.id });
        const story = this.deps.stories.read(tab, task.id);
        const change = newestChange(facts);
        const stale = change !== null && (story === null || story.at < change);
        const key = `${tab}\u0000${task.id}`;
        const before = this.asked.get(key);
        const asks = stale && before?.change !== change;
        if (asks) {
            this.asked.set(key, { change, at: now });
        }
        const waiting = this.asked.get(key);
        return { task: { name: task.name, facts, story, curating: stale && waiting !== undefined && now - waiting.at < CURATING_MS }, asks };
    }

    read(tab: string, view: TabView | null, now: number): ExpandedData {
        const recap = this.deps.records.readRecap(tab);
        const found = (recap?.tasks ?? []).map((task) => this.taskOf(tab, task, now));
        if (found.some((one) => one.asks)) {
            this.deps.requests.requestCurate(tab);
        }
        const lanes = view?.lanes ?? [];
        const session = sessionFactsOf({
            firstSeen: this.deps.session.firstSeen(tab), now, runs: this.deps.session.runsByCause(tab), compactions: this.deps.session.compactions(tab),
            lanes: lanes.map((lane) => ({ agent: lane.agent, label: clipped(lane.title), context: lane.context ?? null })),
            webs: lanes.map((lane) => lane.web ?? null), edits: this.deps.edits(recap?.lanes ?? [], now),
            chapters: this.deps.boundaries.chapterCount(tab),
            ...(this.deps.autocompact === undefined ? {} : { autocompact: this.deps.autocompact.countsFor(tab) }),
        });
        return { tasks: found.map((one) => one.task), session, webs: lanes.map((lane) => lane.web), breaks: this.deps.boundaries.breaksOf(tab) };
    }
}
