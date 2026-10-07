// What the expanded view shows, gathered from the store: every task's facts and story, the session facts, and — when
// the story is older than the ledger — the one request that asks the daemon's curator to write it again. No model call.
import type { Ledger } from '#src/ports/ledger.ts';
import type { LaneCursor, RecapRecords } from '#src/ports/recap-records.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { SessionSource } from '#src/ports/session-source.ts';
import type { Stories } from '#src/ports/stories.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { sessionFactsOf } from '#src/recap/domain/session-facts.ts';
import type { ExpandedTask, ExpandedView } from '#src/recap/render/expanded.ts';
import type { FileCount } from './edit-counts.ts';

/** a story that was asked for and has not come is given up on after this long */
export const CURATING_MS = 10 * 60_000;
const LABEL_CHARS = 20;

export interface ExpandedDeps {
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly stories: Stories;
    readonly session: SessionSource;
    readonly requests: Pick<Requests, 'requestCurate'>;
    /** the files most edited in these lanes, as far as they are known now */
    readonly edits: (lanes: readonly LaneCursor[], now: number) => readonly FileCount[];
}

export type ExpandedData = Pick<ExpandedView, 'tasks' | 'session' | 'webs'>;

/** The newest change in a task's ledger: a fact added, confirmed or closed. */
export const newestChange = (facts: readonly Fact[]): number | null =>
    facts.length === 0 ? null : Math.max(...facts.map((fact) => Math.max(fact.lastAt, fact.closedAt ?? 0)));

const clipped = (label: string | null): string | null => (label === null || label.length <= LABEL_CHARS ? label : `${label.slice(0, LABEL_CHARS - 1)}…`);

export class ExpandedModel {
    private readonly deps: ExpandedDeps;
    /** per task: the change the curator was asked about, and when */
    private readonly asked = new Map<string, { readonly change: number; readonly at: number }>();

    constructor(deps: ExpandedDeps) {
        this.deps = deps;
    }

    /** One task: its facts and story; `curating` while an answer to the last request is awaited. Asks at most once per change. */
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
        });
        return { tasks: found.map((one) => one.task), session, webs: lanes.map((lane) => lane.web) };
    }
}
