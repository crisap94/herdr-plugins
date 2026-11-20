import type { Done } from '#src/ports/columns.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import { beginCompact, noteFromRequest, opensAskPopup, type CompactStart } from './compact-start.ts';
import { stepNote, type NoteState, type NoteStepped } from './compact-keys.ts';
import { restartAnswers } from './ask-restart.ts';
import { PaneTypingLease, type Acquired } from './typing-lease.ts';
import { LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import type { AnswerTally, Skip, StoredDecision } from '#src/ports/autocompact-records.ts';
import type { Decider, Noul } from '#src/ports/decider.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { must } from '#src/protocol/result.ts';
import { parseCheckedFact, type CheckedFact } from '#src/recap/domain/autocompact.ts';
import { parseCount, parsePositiveCount } from '#src/recap/domain/count.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { checkCoverage, checkedFactsOf, correctionFor, KEPT_AT_LEAST, questionsOf, unmetLinesOf, unmetOf, type CheckedCoverage, type MissingPart, type UnmetFact } from './brief-coverage.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { parseWireText } from '#src/protocol/primitives.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import { parseAskId } from '#src/recap/domain/compact-request.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant, parseInstant, parseMilliseconds, type Instant } from '#src/recap/domain/time.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { listingOf, parseListingArgs, type ParsedListing } from './autocompact-listing.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { CompactRequestQueue } from './compact-requests.ts';
import { CurateTasks, type CurateDeps, type CurateWhy } from './curate.ts';
import { LaneDispatch, type LaneDispatchDeps, type PaneSource } from './dispatch.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Intent } from '#src/recap/domain/intent.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import { parseSessionPath, parseTabId } from '#src/recap/domain/ids.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { mergedWindows, replayFile, type Replayed, type TypedReplayDeps } from './replay.ts';
import type { ImportedChapter } from '#src/ports/imported-recaps.ts';
import { compareChapters, type Comparison, type TypedCompareDeps } from './compare-imported.ts';
import { wireMap } from './twins/compact-requests/legacy.ts';
import type { CompactRequestDeps } from './twins/compact-requests/legacy.ts';
import type { RestartDeps } from './twins/restart/legacy.ts';
import type { TypingLeaseDeps } from './twins/typing-lease-deps/legacy.ts';
import { withoutLedgers } from './twins/ledgers/legacy.ts';

export type { CompactRequestDeps, RestartDeps, TypingLeaseDeps };
export { withoutLedgers };

export interface CoverageFact {
    readonly section: string;
    readonly text: string;
    readonly why: string | null;
}

export interface MissingFact {
    readonly index: number;
    readonly fact: CoverageFact;
    readonly parts: readonly MissingPart[];
}

export interface Coverage {
    readonly ok: boolean;
    readonly missing: readonly string[];
    readonly missingFacts: readonly MissingFact[];
    readonly answers: Readonly<Record<string, number>>;
    readonly unknown: string | null;
    readonly costUsd?: number | null;
}

const probabilityOf = (raw: number): Probability => {
    const found = parseProbability(raw);
    if (found === null) throw new RangeError(`not a probability: ${raw}`);
    return found;
};

const typedFacts = (facts: readonly CoverageFact[]): CheckedFact[] => facts.flatMap((fact) => {
    const checked = parseCheckedFact(fact);
    return checked === null ? [] : [checked];
});

const typedAnswers = (answers: Readonly<Record<string, number>>): AnswerTally => new Map(Object.entries(answers).map(([key, value]) => [must(parseText(key)), probabilityOf(value)] as const));

const typedUnmet = (missing: readonly MissingFact[]): UnmetFact[] => missing.flatMap(({ index, fact, parts }) => {
    const checked = parseCheckedFact(fact);
    return checked === null ? [] : [{ index: must(parseCount(index)), fact: checked, parts }];
});

const legacyCoverage = (result: CheckedCoverage): Coverage => ({
    ok: result.complete === 'present',
    missing: result.missing,
    missingFacts: result.missingFacts,
    answers: Object.fromEntries(result.answers),
    unknown: result.unknown,
    ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
});

export const factsOf = (history: readonly HistoryFact[]): readonly CoverageFact[] => checkedFactsOf(history);

export const questionsFor = (facts: readonly CoverageFact[]): ReadonlyMap<Text, Noul> => questionsOf(typedFacts(facts));

export const missingOf = (answers: Readonly<Record<string, number>>, facts: readonly CoverageFact[], keptAtLeast: number = KEPT_AT_LEAST): readonly MissingFact[] =>
    unmetOf(typedAnswers(answers), typedFacts(facts), probabilityOf(keptAtLeast));

export const linesOf = (missing: readonly MissingFact[]): readonly string[] => unmetLinesOf(typedUnmet(missing));

export const correctionOf = (missing: readonly string[]): string => correctionFor(missing.map((line) => must(parseText(line))));

export const covered = (brief: string, facts: readonly CoverageFact[], decider: Decider, keptAtLeast: number = KEPT_AT_LEAST): Promise<Coverage> =>
    checkCoverage(must(parseText(brief)), typedFacts(facts), decider, probabilityOf(keptAtLeast)).then(legacyCoverage);

export class CompactRequests {
    private readonly queue: CompactRequestQueue;

    constructor(deps: CompactRequestDeps) {
        this.queue = new CompactRequestQueue({
            enabled: (): Presence => (deps.enabled() ? 'present' : 'absent'),
            board: deps.board,
            requests: deps.requests,
            asks: deps.asks,
            tokens: deps.tokens,
            now: (): Instant => must(parseInstant(deps.now())),
            log: (line: Text): void => deps.log(line),
        });
    }

    onPaneTokens(pane: string, tokens: TokenMap): void {
        if (pane.trim() === '') {
            return;
        }
        this.queue.onPaneTokens(paneId(pane), wireMap(tokens));
    }

    tick(): void {
        this.queue.tick();
    }

    answer(id: string, pane: string, stage: string): void {
        const askId = parseAskId(id);
        if (askId !== null && pane.trim() !== '') {
            this.queue.answer(askId, paneId(pane), must(parseWireText(stage)));
        }
    }
}

export const optionalText = (note: string | null | undefined): Text | null | undefined => (note === null || note === undefined ? note : must(parseText(note)));

export function requestNoteOf(text: string): Text | null {
    return noteFromRequest(must(parseText(text)));
}

export const opensPopup = (note: string | null | undefined, setting: CompactNote): boolean => opensAskPopup(optionalText(note), setting) === 'present';

export function startCompact(tab: string, pane: string | null, note: string | null | undefined, setting: CompactNote, start: CompactStart): Promise<Done> {
    return beginCompact(tabId(tab), pane === null ? null : paneId(pane), optionalText(note), setting, start);
}

export function step(state: NoteState, key: string): NoteStepped {
    return stepNote(state, must(parseText(key)));
}

export function answerRestart(deps: RestartDeps): number {
    return restartAnswers({ ...deps, compactions: { interrupted: (at, why) => must(parseCount(deps.compactions.interrupted(at, why))) }, enabled: () => (deps.enabled() ? 'present' : 'absent'), now: () => instant(deps.now()), restartedWhy: must(parseText(deps.restartedWhy)) });
}

export class TypingLease {
    private readonly lease: PaneTypingLease;

    constructor(deps: TypingLeaseDeps) {
        this.lease = new PaneTypingLease({ tokens: deps.tokens, panes: deps.panes, now: (): Instant => instant(deps.now()), pause: deps.pause, log: deps.log });
    }

    release(pane: string): Promise<void> {
        return this.lease.release(paneId(pane));
    }

    acquire(pane: string, waitMs: number = LEASE_TTL_MS): Promise<Acquired> {
        return this.lease.acquire(paneId(pane), must(parseMilliseconds(waitMs)));
    }
}

export function parseListing(argv: readonly string[]): ParsedListing {
    return parseListingArgs(argv.map((arg) => must(parseText(arg))));
}

export function listing(decisions: readonly StoredDecision[], spent: { readonly since: number; readonly costUsd: number }, now: number, zone: string, skips: readonly Skip[] = []): readonly Text[] {
    return listingOf(decisions, { since: instant(spent.since), costUsd: must(parseUsd(spent.costUsd)) }, instant(now), must(parseText(zone)), skips);
}

export class Curate {
    private readonly typed: CurateTasks;

    constructor(deps: CurateDeps) {
        this.typed = new CurateTasks(deps);
    }

    afterRun(event: Parameters<CurateTasks['afterRun']>[0]): Promise<void> {
        return this.typed.afterRun(event);
    }

    async run(tab: string, why: CurateWhy = 'open'): Promise<void> {
        const parsed = parseTabId(tab);
        if (parsed.kind === 'ok') {
            await this.typed.run(parsed.value, why);
        }
    }
}

export interface LivePromptSource { of(pane: string): string | null; refresh(lane: Lane): Promise<boolean> }

export interface LaneContextSource { of(pane: string): ContextUse | null; refresh(lane: Lane): Promise<boolean> }

export interface LaneWebSource { of(pane: string): LaneWeb | null; refresh(lane: Lane): Promise<boolean> }

export interface DispatchDeps extends Omit<LaneDispatchDeps, 'prompts' | 'webs' | 'contexts'> {
    readonly prompts: LivePromptSource;
    readonly webs: LaneWebSource;
    readonly contexts?: LaneContextSource;
}

interface OldSource<Found> { of(pane: string): Found | null; refresh(lane: Lane): Promise<boolean> }

const sourceOf = <Found, Typed>(source: OldSource<Found>, read: (found: Found) => Typed): PaneSource<Typed> => ({
    of: (pane) => { const found = source.of(pane); return found === null ? null : read(found); },
    refresh: async (lane): Promise<Presence> => ((await source.refresh(lane)) ? 'present' : 'absent'),
});

const same = <Found>(found: Found): Found => found;

export class Dispatch {
    private readonly typed: LaneDispatch;

    constructor(deps: DispatchDeps) {
        const { prompts, webs, contexts, ...rest } = deps;
        const typedContexts = contexts === undefined ? {} : { contexts: sourceOf(contexts, same) };
        this.typed = new LaneDispatch({ ...rest, prompts: sourceOf(prompts, (found) => must(parseText(found))), webs: sourceOf(webs, same), ...typedContexts });
    }

    send(intent: Intent): Promise<void> {
        return this.typed.send(intent);
    }
}

export interface ReplayDeps extends Omit<TypedReplayDeps, 'language' | 'log'> { readonly language: string; readonly log: (line: string) => void }

export function windowsOf(entries: readonly Entry[], mergeTurns = 1): readonly (readonly Entry[])[] {
    return mergedWindows(entries, must(parsePositiveCount(mergeTurns)));
}

export function replay(deps: ReplayDeps, file: string, label: string, size: number, mergeTurns = 1): Promise<Replayed> {
    const { language, log, ...rest } = deps;
    return replayFile({ ...rest, language: must(parseText(language)), log: (line: Text): void => log(line) }, must(parseSessionPath(file)), must(parseTabId(label)), must(parseCount(size)), must(parsePositiveCount(mergeTurns)));
}

export interface CompareDeps extends Omit<TypedCompareDeps, 'label'> { readonly label: string }

export function compareImported(deps: CompareDeps, chapters: readonly ImportedChapter[]): Promise<Comparison> {
    const typed = chapters.map((chapter) => ({ n: must(parseCount(chapter.n)), at: must(parseInstant(chapter.at)), items: chapter.items }));
    return compareChapters({ ...deps, label: must(parseTabId(deps.label)) }, typed);
}
