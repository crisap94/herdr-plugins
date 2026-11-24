import { knownOr, type GuardedLedger, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { BoundaryLog } from '#src/ports/boundaries.ts';
import type { SessionCursor } from '@stateforge-labs/session-ledger';
import type { RequestPort } from '#src/ports/requests.ts';
import type { SessionSourcePort } from '#src/ports/session-source.ts';
import type { Story } from '@stateforge-labs/session-ledger';
import type { LegacyStories as Stories } from '@stateforge-labs/session-ledger';
import type { TabViewRecord } from '#src/ports/tab-views.ts';
import type { Fact } from '@stateforge-labs/session-ledger';
import type { DecisionCounts, DecisionLedger } from '@stateforge-labs/session-ledger';
import { RUN_CAUSES, sessionFactsFrom, type RunCounts, type SessionReadings } from '#src/recap/domain/session-facts.ts';
import type { ExpandedTask, ExpandedView } from '#src/recap/render/expanded.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseTabId, type ScopeId } from '#src/recap/domain/ids.ts';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { parseCurating, parseInstant, parseProse, parseTaskName } from '@stateforge-labs/recap-view';
import { viewBreakOf, webOf } from '#src/view-model/column.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import { instant, type Instant } from '@stateforge-labs/session-ledger';

export interface FileCount {
    readonly path: Text;
    readonly count: Count;
}

export const CURATING_MS = 10 * 60_000;
const LABEL_CHARS = 20;
const NO_DECISIONS: DecisionCounts = { decisions: must(parseCount(0)), compacted: must(parseCount(0)), waited: must(parseCount(0)) };

export interface ExpandedDeps {
    readonly records: GuardedRecapRecords;
    readonly ledger: GuardedLedger;
    readonly stories: Stories;
    readonly session: SessionSourcePort;
    readonly autocompact?: Pick<DecisionLedger, 'countsFor'>;
    readonly boundaries: Pick<BoundaryLog, 'breaksOf' | 'chapterCount'>;
    readonly requests: Pick<RequestPort, 'requestCurate'>;
    readonly edits: (lanes: readonly SessionCursor[], now: Instant) => readonly FileCount[];
}

export type ExpandedData = Pick<ExpandedView, 'tasks' | 'session' | 'webs' | 'breaks'>;

interface TaskRef {
    readonly id: Text;
    readonly name: Text;
}

type CurateAsk = 'asks' | 'holds';

interface FoundTask {
    readonly task: ExpandedTask;
    readonly asks: CurateAsk;
}

type SessionReads = Pick<SessionReadings, 'firstSeen' | 'runs' | 'compactions' | 'autocompact'>;

export const newestChange = (facts: readonly Fact[]): Instant | null =>
    facts.length === 0 ? null : instant(Math.max(...facts.map((fact) => Math.max(fact.lastAt, fact.closedAt ?? 0))));

const clipped = (label: Text | null): Text | null => (label === null || label.length <= LABEL_CHARS ? label : textOf(`${label.slice(0, LABEL_CHARS - 1)}…`));

const toldOf = (story: Story | null): ExpandedTask['story'] => (story === null ? null : { text: parseProse(story.text), at: parseInstant(story.at) });

const runsIn = (runs: Readonly<Record<Text, Count>>): RunCounts => Object.fromEntries(RUN_CAUSES.flatMap((cause) => {
    const count = runs[textOf(cause)];
    return count === undefined ? [] : [[cause, count]];
}));

export class ExpandedModel {
    private readonly deps: ExpandedDeps;
    private readonly asked = new Map<Text, { readonly change: Instant; readonly at: Instant }>();

    constructor(deps: ExpandedDeps) {
        this.deps = deps;
    }

    private taskOf(tab: ScopeId, task: TaskRef, now: Instant): FoundTask {
        const facts = knownOr(this.deps.ledger.allOf({ scope: tab, key: task.id }), []);
        const story = this.deps.stories.read(tab, task.id);
        const change = newestChange(facts);
        const stale = change !== null && (story === null || story.at < change);
        const key = textOf(`${tab}\u0000${task.id}`);
        const before = this.asked.get(key);
        const asks: CurateAsk = stale && before?.change !== change ? 'asks' : 'holds';
        if (change !== null && asks === 'asks') {
            this.asked.set(key, { change, at: now });
        }
        const waiting = this.asked.get(key);
        return { task: { name: parseTaskName(task.name), facts, story: toldOf(story), curating: parseCurating(stale && waiting !== undefined && now - waiting.at < CURATING_MS) }, asks };
    }

    private sessionReads(tab: ScopeId): SessionReads {
        const counted = parseTabId(tab);
        if (counted.kind !== 'ok') {
            return { firstSeen: null, runs: {}, compactions: [], ...(this.deps.autocompact === undefined ? {} : { autocompact: NO_DECISIONS }) };
        }
        const { session, autocompact } = this.deps;
        return {
            firstSeen: session.firstSeen(counted.value),
            runs: runsIn(session.runsByCause(counted.value)),
            compactions: session.compactions(counted.value).map((record) => ({ tokensBefore: record.tokensBefore, tokensAfter: record.tokensAfter, origin: record.origin })),
            ...(autocompact === undefined ? {} : { autocompact: autocompact.countsFor(counted.value) }),
        };
    }

    read(tab: ScopeId, view: TabViewRecord | null, now: Instant): ExpandedData {
        const recap = knownOr(this.deps.records.readRecap(tab), null);
        const found = (recap?.tasks ?? []).map((task) => this.taskOf(tab, task, now));
        if (found.some((one) => one.asks === 'asks')) {
            this.deps.requests.requestCurate(tab);
        }
        const lanes = view?.lanes ?? [];
        const session = sessionFactsFrom({
            ...this.sessionReads(tab), now,
            lanes: lanes.map((lane) => ({ agent: textOf(lane.agent), label: clipped(lane.title), context: lane.context ?? null })),
            webs: lanes.map((lane) => (lane.web === undefined || lane.web === null ? null : { base: lane.web.base, branch: lane.web.branch })),
            edits: this.deps.edits(recap?.sessions ?? [], now).map((edit) => ({ path: edit.path, count: edit.count })),
            chapters: this.deps.boundaries.chapterCount(tab),
        });
        return { tasks: found.map((one) => one.task), session, webs: lanes.map((lane) => (lane.web === undefined || lane.web === null ? lane.web : webOf(lane.web))), breaks: this.deps.boundaries.breaksOf(tab).map(viewBreakOf) };
    }
}
