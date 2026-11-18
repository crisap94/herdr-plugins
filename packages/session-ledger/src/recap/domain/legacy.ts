import { must } from '#src/protocol/result.ts';
import { AUTO_ORDER, backendRecord, HARNESS_BY_ID, INSTALLABLE_HARNESS_NAMES, type BackendChoice, type BackendId, type EnvironmentName, type HarnessEntry } from './backend.ts';
import { brand } from './brand.ts';
import { PLUGIN_WITHIN_MS, type BoundaryKind, type OwnTrigger, type Trigger } from './boundary.ts';
import type { WindowOf, WindowSource } from './compaction.ts';
import type { Directory } from './directory.ts';
import type { ClosedWhy, FactId, RunId, Section } from './fact.ts';
import { parseFailureCause, type FailureCause } from './failure-cause.ts';
import { foldedOf } from './gates/words.ts';
import type { TaskShape } from './grouping.ts';
import { holdingDetail, joinedDetail, keptDetail, overridingDetail, type AwaitedNames, type BackgroundLabel, type BackgroundTool, type Flight, type FlightDetail, type FlightReason, type RunningCount } from './in-flight.ts';
import type { AgentKind, LaneStatus, PaneId, SessionId, TabId, WorkspaceId } from './lane-shape.ts';
import { fold, foldSwept, type Folded, type Operation } from './ops.ts';
import { REGISTERED_KINDS, type RegisteredKind, type RegisteredKindTable } from './registered-kinds.ts';
import { parseText, type Text } from './text.ts';
import type { Duration, Instant } from './time.ts';

export function environmentName(raw: string): EnvironmentName {
    if (raw.trim() === '') throw new Error('an environment name cannot be empty');
    return brand<string, 'EnvironmentName'>(raw);
}

export function hasModel(id: BackendId): boolean { return HARNESS_BY_ID[id].model !== null; }
export function modelOf(id: BackendId): HarnessEntry['model'] { return HARNESS_BY_ID[id].model; }
export function enumeratesJob(id: BackendId): boolean { return HARNESS_BY_ID[id].job.enumerates; }
export function hasAvailabilityMark(id: BackendId): boolean { return HARNESS_BY_ID[id].availabilityMark; }

export const jobEnvironmentNames = (harnesses: readonly { readonly job: { readonly envScrub: readonly EnvironmentName[] } }[]): readonly EnvironmentName[] => [...new Set(harnesses.flatMap(({ job }) => job.envScrub))];

export const harnessChoiceLabels = (customCommand: string): Readonly<Record<BackendId, string>> => backendRecord((id) => HARNESS_BY_ID[id].customCommand ? customCommand : HARNESS_BY_ID[id].label);

export const installableHarnessSentence = (): string => `${INSTALLABLE_HARNESS_NAMES.slice(0, -1).join(', ')} or ${INSTALLABLE_HARNESS_NAMES.at(-1) ?? ''}`;

export const pick = (choice: BackendChoice, available: readonly string[]): BackendId | null => (choice === 'auto' ? (AUTO_ORDER.find((id) => available.includes(id)) ?? null) : choice);

export interface LaneMark { readonly pane: string; readonly at: number; readonly cursor: number; readonly tokensBefore?: number; readonly tokensAfter?: number; readonly tookMs?: number; readonly trigger?: OwnTrigger; }

export interface Planned { readonly kind: BoundaryKind; readonly pane: string; readonly at: number; readonly trigger: Trigger | null; readonly cursor: number; readonly tokensBefore: number | null; readonly tokensAfter: number | null; readonly tookMs: number | null; }

export const triggerOf = (at: number, asked: readonly number[], own: OwnTrigger | null): Trigger => (asked.some((started) => started <= at && at - started <= PLUGIN_WITHIN_MS) ? 'plugin' : own ?? 'auto');

export function compactedFrom(marks: readonly LaneMark[], lastAt: number | null, asked: readonly number[]): readonly Planned[] {
    return marks.filter((mark) => lastAt === null || mark.at > lastAt).toSorted((a, b) => a.at - b.at).map((mark) => ({
        kind: 'compacted', pane: mark.pane, at: mark.at, trigger: triggerOf(mark.at, asked, mark.trigger ?? null), cursor: mark.cursor, tokensBefore: mark.tokensBefore ?? null, tokensAfter: mark.tokensAfter ?? null, tookMs: mark.tookMs ?? null,
    }));
}

export const chapterStart = (at: number, sealedStart: number): number => Math.max(at, sealedStart);

export const settledBefore = (closedAt: number | null, boundaryAt: number | null): boolean => closedAt !== null && boundaryAt !== null && closedAt < boundaryAt;

export interface RegisteredKindCapabilities { readonly hasTranscript: boolean; readonly compactable: boolean; readonly defaultPolicy: boolean; readonly autocompactDefault: boolean; }

const isRegisteredKind = (raw: string): raw is RegisteredKind => Object.hasOwn(REGISTERED_KINDS, raw);

export const registeredKindOf = (raw: string): RegisteredKind | null => (isRegisteredKind(raw) ? raw : null);

export function kindsWith<const T extends RegisteredKindTable>(table: T, capability: keyof RegisteredKindCapabilities): readonly (keyof T)[] {
    return (Object.keys(table) as (keyof T)[]).filter((kind) => table[kind]?.[capability] === true);
}

export function compactableKinds<T extends RegisteredKindTable>(table: T): readonly (keyof T)[] {
    return kindsWith(table, 'compactable');
}

export type CompactTarget = { readonly kind: 'focused' } | { readonly kind: 'all' } | { readonly kind: 'kinds'; readonly kinds: readonly string[] };

export const HINT_DEFAULT = 40;
export const HINT_MIN = 10;
export const HINT_MAX = 95;

const list = (raw: string | undefined): readonly string[] => [...new Set((raw ?? '').split(/[\s,]+/).map((word) => word.toLowerCase()).filter((word) => word !== ''))];

export function parseCompactTarget(input: unknown): CompactTarget {
    const kinds = list(typeof input === 'string' ? input : undefined);
    if (kinds.includes('all')) return { kind: 'all' };
    const chosen = kinds.filter((kind) => kind !== 'focused');
    return kinds.includes('focused') || chosen.length === 0 ? { kind: 'focused' } : { kind: 'kinds', kinds: chosen };
}

export const targetSetting = (raw: string | undefined): string => ((target) => (target.kind === 'kinds' ? target.kinds.join(',') : target.kind))(parseCompactTarget(raw));

export function hintOf(raw: string | undefined): number | null {
    const word = (raw ?? '').trim().toLowerCase();
    const percent = Number(word.replace(/%$/, ''));
    if (word === 'off') return null;
    return word !== '' && Number.isInteger(percent) && percent >= HINT_MIN && percent <= HINT_MAX ? percent : HINT_DEFAULT;
}

export const hintSetting = (raw: string | undefined): string => String(hintOf(raw) ?? 'off');

export const windowOf = (raw: string | undefined): number | null => ((tokens) => (Number.isInteger(tokens) && tokens >= 1000 ? tokens : null))(Number((raw ?? '').replaceAll(/[_,\s]/g, '')));

export const windowSetting = (raw: string | undefined): string => String(windowOf(raw) ?? '');

export interface ContextUse { readonly tokens: number; readonly window: number; readonly source: WindowSource; }

export interface ContextObserved { readonly tokens: number; readonly peak: number; readonly window: number | null; readonly model: string | null; }

export interface WindowBasis { readonly window: number; readonly source: WindowSource; readonly sizes: readonly number[]; }

const raised = (basis: WindowBasis, seen: number): number => (seen <= basis.window ? basis.window : (basis.sizes.find((size) => size >= seen) ?? seen));

export function contextOf(found: { readonly observed: ContextObserved; readonly setting: number | null }, resolveWindow: WindowOf): ContextUse | null {
    const { observed, setting } = found;
    if (setting !== null) return { tokens: observed.tokens, window: setting, source: 'setting' };
    const base = resolveWindow(observed);
    if (base === null) return null;
    const window = raised(base, Math.max(observed.tokens, observed.peak));
    return { tokens: observed.tokens, window, source: window === base.window ? base.source : 'observed' };
}

export const shareOf = (use: ContextUse): number => Math.round((100 * use.tokens) / use.window);

export const sizeOf = (window: number): string => (window >= 1_000_000 ? `${Number((window / 1_000_000).toFixed(1))}M` : `${Math.round(window / 1000)}k`);

export function tokensOf(count: number): string {
    if (count >= 1_000_000) return `${Number((count / 1_000_000).toFixed(1))}M`;
    return count >= 1000 ? `${Number((count / 1000).toFixed(1))}k` : String(count);
}

export const hintFor = (use: ContextUse | null | undefined, threshold: number | null): number | null =>
    use === null || use === undefined || threshold === null || use.window <= 0 || use.tokens * 100 < threshold * use.window ? null : shareOf(use);

export interface TaskId { readonly tab: string; readonly key: string; }

export interface Fact { readonly id: FactId; readonly task: TaskId; readonly section: Section; readonly text: string; readonly why: string | null; readonly ref: string | null; readonly agent: string | null; readonly anchor: string | null; readonly firstAt: number; readonly lastAt: number; readonly state: 'open' | 'closed'; readonly closedWhy: ClosedWhy | null; readonly closedAt: number | null; readonly language: string; }

export const sameTask = (a: TaskId, b: TaskId): boolean => a.tab === b.tab && a.key === b.key;

export const isOpen = (fact: Fact): boolean => fact.state === 'open';

const NAME_SHAPE = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,39}$/;

export function failureCauseOf(error: unknown): FailureCause {
    let text = 'NonError';
    try {
        if (error instanceof Error) {
            const name = NAME_SHAPE.test(error.name) ? error.name : 'Error';
            const code = 'code' in error && typeof error.code === 'string' && CODE_SHAPE.test(error.code) ? error.code : null;
            text = code === null ? name : `${name}: ${code}`;
        }
    } catch {
        text = 'Error';
    }
    return parseFailureCause(must(parseText(text)));
}

export interface RecapSections { readonly goal: string; readonly now: readonly string[]; readonly needs: readonly string[]; readonly done: readonly string[]; readonly decisions: readonly string[]; readonly next: readonly string[]; readonly links: readonly string[]; readonly rules: readonly string[]; }

export interface RecapTask { readonly id: string; readonly name: string; readonly lanes: readonly string[]; readonly sections: RecapSections | null; readonly markdown: string; }

export interface PlacedLane { readonly pane: string; readonly place: string | null; }

const folderOf = (place: string | null): string => (place ?? '').split('/').findLast((part) => part !== '') ?? '';

const nextKey = (taken: readonly string[]): string => `t${taken.reduce((most, id) => Math.max(most, Number(/^t(\d+)$/.exec(id)?.[1] ?? 0)), 0) + 1}`;

interface Draft { id: string; name: string; lanes: string[]; }

function seat(drafts: Draft[], lane: PlacedLane, world: { readonly places: ReadonlyMap<string, string | null>; readonly taken: readonly string[]; readonly reuse: string | null }): void {
    const home = drafts.find((draft) => lane.place !== null && draft.lanes.some((pane) => world.places.get(pane) === lane.place)) ?? (lane.place === null ? drafts[0] : undefined);
    if (home !== undefined) return void home.lanes.push(lane.pane);
    drafts.push({ id: drafts.length === 0 && world.reuse !== null ? world.reuse : nextKey([...world.taken, ...drafts.map((draft) => draft.id)]), name: '', lanes: [lane.pane] });
}

function named(drafts: readonly Draft[], places: ReadonlyMap<string, string | null>): readonly TaskShape[] {
    const nameOf = (draft: Draft): string => (draft.name === '' ? folderOf(places.get(draft.lanes[0] ?? '') ?? null) : draft.name);
    return drafts.map((draft) => ({ id: draft.id, lanes: draft.lanes, name: drafts.length === 1 ? '' : nameOf(draft) }));
}

export function keptGrouping(previous: readonly TaskShape[], lanes: readonly PlacedLane[], retired: readonly string[] = []): readonly TaskShape[] {
    const panes = new Set(lanes.map((lane) => lane.pane));
    const places = new Map(lanes.map((lane) => [lane.pane, lane.place]));
    const drafts: Draft[] = previous.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes.filter((pane) => panes.has(pane)) })).filter((task) => task.lanes.length > 0);
    const reuse = drafts.length === 0 && previous.length === 1 ? (previous[0]?.id ?? null) : null;
    for (const lane of lanes.filter((each) => !drafts.some((draft) => draft.lanes.includes(each.pane)))) {
        seat(drafts, lane, { places, taken: [...retired, ...previous.map((task) => task.id)], reuse });
    }
    return named(drafts, places);
}

export const runningCount = (raw: number): RunningCount => brand<number, 'RunningCount'>(Math.max(0, Math.trunc(raw)));
export const flightReason = (raw: string): FlightReason => brand<string, 'FlightReason'>(raw);
export const awaitedNames = (raw: string): AwaitedNames => brand<string, 'AwaitedNames'>(raw);
export const backgroundTool = (raw: string): BackgroundTool => brand<string, 'BackgroundTool'>(raw);
export const backgroundLabel = (raw: string): BackgroundLabel => brand<string, 'BackgroundLabel'>(raw);

export function holdsLane(flight: Flight, atCeiling: boolean): boolean {
    return flight.foreground.kind !== 'none' || (flight.awaiting.kind === 'on' && !atCeiling);
}

export function flightDetail(flight: Flight, atCeiling: boolean): FlightDetail | null {
    return holdsLane(flight, atCeiling) ? holdingDetail(flight) : joinedDetail([...(atCeiling ? overridingDetail(flight) : []), ...keptDetail(flight)]);
}

export interface Lane { readonly pane: PaneId; readonly tab: TabId; readonly workspace: WorkspaceId; readonly agent: AgentKind; readonly status: LaneStatus; readonly session: SessionId | null; readonly cwd: Directory | null; readonly title: string | null; readonly since: Instant | null; }

export interface AddOp { readonly op: 'add'; readonly section: Section; readonly text: string; readonly why: string | null; readonly ref: string | null; readonly at: number | null; readonly agent: string | null; readonly anchor?: string | null; }

export interface UpdateOp { readonly op: 'update'; readonly id: string; readonly text: string; readonly why: string | null; readonly anchor?: string | null; }

export interface CloseOp { readonly op: 'close'; readonly id: string; readonly why: ClosedWhy | null; readonly anchor?: Text; }

export interface TaskOps { readonly task: string; readonly ops: readonly Operation[]; }

export interface RunRef { readonly id: RunId; readonly task: TaskId; readonly at: number; readonly language: string; mint(): FactId; }

export function apply(ledger: readonly Fact[], ops: readonly Operation[], run: RunRef, sweepNow = false): Folded {
    return sweepNow ? foldSwept(ledger, ops, run) : fold(ledger, ops, run);
}

export const PIPELINES = ['one', 'enumerate', 'enumerate+gates', 'full'] as const;
export const retriesTargeted = (pipeline: (typeof PIPELINES)[number]): boolean => pipeline !== 'enumerate';

export const ANCHOR_CHARS = 120;

export function anchorQuotedIn(anchor: string, source: string): boolean {
    const folded = foldedOf(anchor);
    return folded !== '' && ` ${source} `.includes(` ${folded} `);
}

export const QUOTE_CHARS = ANCHOR_CHARS;

export const quotedIn = (quote: string, text: string): boolean => anchorQuotedIn(quote, foldedOf(text));

export function pieceOf(text: string, at = 0): string {
    const body = text.trim();
    if (body.length <= QUOTE_CHARS) return body;
    const from = Math.max(0, Math.min(at - Math.floor(QUOTE_CHARS / 3), body.length - QUOTE_CHARS));
    const piece = body.slice(from, from + QUOTE_CHARS);
    const [head, tail] = [from > 0 ? piece.search(/\s/) : -1, from + QUOTE_CHARS < body.length ? piece.search(/\s\S*$/) : -1];
    return piece.slice(head >= 0 ? head : 0, tail > 0 ? tail : piece.length).trim();
}

export const EVIDENCE_CHARS = 2 * QUOTE_CHARS;

const CLOSES: readonly ClosedWhy[] = ['done', 'wrong', 'superseded', 'answered', 'merged'];

export type Reconciled = { readonly op: 'update'; readonly id: string; readonly text: string; readonly why: string | null } | { readonly op: 'close'; readonly id: string; readonly why: ClosedWhy };

export interface Reconciliation { readonly ops: readonly Reconciled[]; readonly refused: readonly string[]; }

type Fields = Readonly<Record<string, unknown>>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

const wordsOf = (value: unknown, max: number): string | null => {
    const words = textOf(value).split(/\s+/u).filter((word) => word !== '');
    if (words.length === 0) return null;
    return words.length > max ? `${words.slice(0, max).join(' ')}…` : words.join(' ');
};

interface Ground { readonly facts: ReadonlyMap<string, Fact>; readonly tail: string; readonly touched: Set<string>; readonly closed: Set<string>; readonly kept: Set<string>; }

type Check = (fields: Fields, ground: Ground) => string | null;

const isOpenIn = (id: string, ground: Ground): boolean => ground.facts.get(id)?.state === 'open' && !ground.closed.has(id);

const kind: Check = (fields) => (fields['op'] === 'add' ? 'add is not allowed: a reconciliation only changes or closes what is there' : null)
    ?? (fields['op'] === 'update' || fields['op'] === 'close' ? null : `${textOf(fields['op'])} is not an operation`);

const open: Check = (fields, ground) => {
    const id = textOf(fields['id']);
    const free = isOpenIn(id, ground) && !ground.touched.has(id) && !(fields['op'] === 'close' && ground.kept.has(id));
    return free ? null : `${id} is not an open fact (or is already changed)`;
};

const reason: Check = (fields, ground) => {
    const id = textOf(fields['id']);
    if (fields['op'] !== 'close') return null;
    if (!CLOSES.some((why) => why === fields['why'])) return `close ${id} needs a reason: done, wrong, superseded, answered or merged`;
    return fields['why'] === 'answered' && ground.facts.get(id)?.section !== 'needs' ? `close ${id} as answered: only a "needs" fact is answered` : null;
};

const merge: Check = (fields, ground) => {
    const [id, into] = [textOf(fields['id']), textOf(fields['into'])];
    return isOpenIn(into, ground) && into !== id ? null : `close ${id} as merged needs another open fact to merge into`;
};

const evidence: Check = (fields, ground) => {
    const quote = textOf(fields['evidence']);
    return quote.length <= EVIDENCE_CHARS && quotedIn(quote, ground.tail) ? null : `${textOf(fields['op'])} ${textOf(fields['id'])}: its evidence is not in the newest turns`;
};

function refusalOf(fields: Fields, ground: Ground): string | null {
    const refused = [kind, open, reason].reduce<string | null>((why, check) => why ?? check(fields, ground), null);
    return refused ?? (fields['why'] === 'merged' ? merge(fields, ground) : evidence(fields, ground));
}

function operationOf(fields: Fields): Reconciled | null {
    const id = textOf(fields['id']);
    if (fields['op'] === 'close') {
        const why = CLOSES.find((each) => each === fields['why']);
        return why === undefined ? null : { op: 'close', id, why };
    }
    const text = wordsOf(fields['text'], 16);
    return text === null ? null : { op: 'update', id, text, why: wordsOf(fields['why'], 24) };
}

function answerOf(raw: string): readonly unknown[] | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        const ops: unknown = isFields(parsed) ? parsed['ops'] : undefined;
        return Array.isArray(ops) ? Array.from<unknown>(ops) : [];
    } catch {
        return null;
    }
}

function entryOf(entry: unknown, ground: Ground): Reconciled | string {
    const why = isFields(entry) ? refusalOf(entry, ground) : 'not an operation';
    const one = why === null && isFields(entry) ? operationOf(entry) : null;
    if (one === null || !isFields(entry)) {
        return why ?? 'an update needs a text';
    }
    ground.touched.add(one.id);
    if (one.op === 'close') ground.closed.add(one.id);
    if (one.op === 'close' && one.why === 'merged') ground.kept.add(textOf(entry['into']));
    return one;
}

export function reconciliationOf(answer: string, facts: ReadonlyMap<string, Fact>, tail: string): Reconciliation {
    const listed = answerOf(answer);
    if (listed === null) return { ops: [], refused: ['the answer is not JSON'] };
    const ground: Ground = { facts, tail, touched: new Set(), closed: new Set(), kept: new Set() };
    const entries = listed.map((entry) => entryOf(entry, ground));
    return { ops: entries.filter((one) => typeof one !== 'string'), refused: entries.filter((one) => typeof one === 'string') };
}

export function instant(ms: number): Instant { return brand<number, 'Instant'>(ms); }
export function duration(ms: number): Duration { return brand<number, 'Duration'>(ms); }
